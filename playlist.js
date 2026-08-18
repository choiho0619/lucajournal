import { fetchPlayablePosts } from "./posts.js?v=20260818";
import { supabase, getAuthState, onAuthStateChanged } from "./auth.js";

const LOGIN_REQUIRED_MESSAGE = "루카저널 Playlist는 회원가입 후 로그인하면 이용할 수 있습니다.";
const RECOVERY_REQUIRED_MESSAGE = "비밀번호 재설정을 먼저 완료해 주세요.";

let initialized = false;
let initializationPromise = null;

export function initPlaylist() {
  if (initialized) return initializationPromise;
  initialized = true;

  initializationPromise = initialize();
  return initializationPromise;
}

async function initialize() {
  const elements = getElements();
  if (!elements) return;

  const state = {
    tracks: [],
    currentIndex: -1,
    repeatMode: "none",
    shuffle: false,
    shuffleOrder: [],
    shufflePosition: -1,
    playing: false,
    authUser: null,
    authState: "signed-out",
  };

  const authReady = resolveAuthUser(state);
  onAuthStateChanged((_event, session) => {
    state.authState = getAuthState(session);
    state.authUser = state.authState === "authenticated" ? session.user : null;
    if (!state.authUser && !elements.audio.paused) elements.audio.pause();
  });

  bindEvents(elements, state, authReady);
  setControlsDisabled(elements, true);
  setStatus(elements, "플레이리스트를 불러오는 중입니다.");

  let tracks = [];
  try {
    tracks = await fetchPlayablePosts();
  } catch (error) {
    console.error(error);
  }

  state.tracks = Array.isArray(tracks) ? tracks.filter((track) => isValidAudioUrl(track?.audio_url)) : [];
  elements.count.textContent = `${state.tracks.length}곡`;
  renderTrackList(elements, state, authReady);

  if (state.tracks.length === 0) {
    elements.currentTitle.textContent = "곡을 선택해 주세요.";
    elements.currentArtist.textContent = "루카저널";
    setStatus(elements, "현재 재생 가능한 오디오가 없습니다.");
    return;
  }

  setControlsDisabled(elements, false);
  elements.progress.disabled = true;
  elements.currentTitle.textContent = "곡을 선택해 주세요.";
  elements.currentArtist.textContent = "루카저널";
  setStatus(elements, "");
}

function getElements() {
  const elements = {
    audio: document.getElementById("playlist-audio"),
    currentTitle: document.getElementById("playlist-current-title"),
    currentArtist: document.getElementById("playlist-current-artist"),
    currentTime: document.getElementById("playlist-current-time"),
    duration: document.getElementById("playlist-duration"),
    progress: document.getElementById("playlist-progress"),
    previous: document.getElementById("playlist-prev"),
    play: document.getElementById("playlist-play"),
    next: document.getElementById("playlist-next"),
    shuffle: document.getElementById("playlist-shuffle"),
    repeat: document.getElementById("playlist-repeat"),
    trackToggle: document.getElementById("playlist-track-toggle"),
    count: document.getElementById("playlist-count"),
    status: document.getElementById("playlist-status"),
    trackList: document.getElementById("playlist-track-list"),
  };

  return Object.values(elements).every(Boolean) ? elements : null;
}

function bindEvents(elements, state, authReady) {
  const { audio } = elements;

  elements.play.addEventListener("click", async () => {
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (await requirePlaybackAccess(state, authReady)) togglePlayback(elements, state, authReady);
  });
  elements.previous.addEventListener("click", async () => {
    if (await requirePlaybackAccess(state, authReady)) moveToPreviousTrack(elements, state, authReady);
  });
  elements.next.addEventListener("click", async () => {
    if (await requirePlaybackAccess(state, authReady)) moveToNextTrack(elements, state, authReady);
  });
  elements.shuffle.addEventListener("click", () => toggleShuffle(elements, state));
  elements.repeat.addEventListener("click", () => cycleRepeatMode(elements, state));
  elements.trackToggle.addEventListener("click", () => toggleTrackList(elements));
  elements.progress.addEventListener("input", () => seekToProgress(elements));

  audio.addEventListener("play", () => {
    state.playing = true;
    updatePlayButton(elements, true);
    updateTrackStates(elements, state);
  });
  audio.addEventListener("pause", () => {
    state.playing = false;
    updatePlayButton(elements, false);
    updateTrackStates(elements, state);
  });
  audio.addEventListener("ended", () => handleTrackEnded(elements, state, authReady));
  audio.addEventListener("loadedmetadata", () => updateProgress(elements));
  audio.addEventListener("durationchange", () => updateProgress(elements));
  audio.addEventListener("timeupdate", () => updateProgress(elements));
  audio.addEventListener("error", () => {
    if (state.currentIndex < 0 || !audio.getAttribute("src")) return;
    state.playing = false;
    updatePlayButton(elements, false);
    setStatus(elements, "오디오를 재생할 수 없습니다.", true);
  });
}

function renderTrackList(elements, state, authReady) {
  elements.trackList.replaceChildren();

  state.tracks.forEach((track, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playlist-track";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `${getTrackTitle(track)}, ${getTrackArtist(track)} 재생`);

    const number = document.createElement("span");
    number.className = "playlist-track-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("span");
    copy.className = "playlist-track-copy";
    const title = document.createElement("span");
    title.className = "playlist-track-title";
    title.textContent = getTrackTitle(track);
    const meta = document.createElement("span");
    meta.className = "playlist-track-meta";
    meta.textContent = getTrackMeta(track);
    copy.append(title, meta);

    button.append(number, copy);
    button.addEventListener("click", async () => {
      if (await requirePlaybackAccess(state, authReady)) loadTrack(elements, state, index, true, authReady);
    });
    elements.trackList.appendChild(button);
  });
}

function loadTrack(elements, state, index, shouldPlay, authReady) {
  const track = state.tracks[index];
  if (!track || !isValidAudioUrl(track.audio_url)) {
    setStatus(elements, "오디오를 재생할 수 없습니다.", true);
    return;
  }

  resetAudioSource(elements.audio);
  state.currentIndex = index;
  syncShufflePosition(state);
  elements.currentTitle.textContent = getTrackTitle(track);
  elements.currentArtist.textContent = getTrackArtist(track);
  elements.currentTime.textContent = "0:00";
  elements.duration.textContent = "0:00";
  elements.progress.value = "0";
  elements.progress.disabled = true;
  elements.audio.src = track.audio_url;
  elements.audio.load();
  setStatus(elements, "");
  updateTrackStates(elements, state);

  if (shouldPlay) playCurrentTrack(elements, state, authReady);
}

function resetAudioSource(audio) {
  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute("src");
  audio.load();
}

async function playCurrentTrack(elements, state, authReady) {
  if (!(await requirePlaybackAccess(state, authReady))) return;

  if (state.currentIndex < 0) {
    const firstIndex = state.shuffle ? state.shuffleOrder[0] : 0;
    loadTrack(elements, state, firstIndex, false);
  }

  try {
    await elements.audio.play();
    setStatus(elements, "");
  } catch (error) {
    state.playing = false;
    updatePlayButton(elements, false);
    setStatus(elements, "오디오를 재생할 수 없습니다.", true);
  }
}

function togglePlayback(elements, state, authReady) {
  if (state.tracks.length === 0) return;
  if (state.currentIndex < 0 || elements.audio.paused) {
    playCurrentTrack(elements, state, authReady);
  } else {
    elements.audio.pause();
  }
}

function moveToNextTrack(elements, state, authReady) {
  if (state.tracks.length === 0) return;
  if (state.currentIndex < 0) {
    playCurrentTrack(elements, state, authReady);
    return;
  }

  const nextIndex = getAdjacentIndex(state, 1);
  if (nextIndex === null) {
    elements.audio.pause();
    state.playing = false;
    updatePlayButton(elements, false);
    updateTrackStates(elements, state);
    updateProgress(elements);
    setStatus(elements, "플레이리스트의 마지막 곡입니다.");
    return;
  }
  loadTrack(elements, state, nextIndex, true, authReady);
}

function moveToPreviousTrack(elements, state, authReady) {
  if (state.tracks.length === 0) return;
  if (state.currentIndex < 0) {
    playCurrentTrack(elements, state, authReady);
    return;
  }
  if (elements.audio.currentTime > 3) {
    elements.audio.currentTime = 0;
    updateProgress(elements);
    return;
  }

  const previousIndex = getAdjacentIndex(state, -1);
  if (previousIndex === null) {
    elements.audio.currentTime = 0;
    updateProgress(elements);
    return;
  }
  loadTrack(elements, state, previousIndex, true, authReady);
}

function getAdjacentIndex(state, direction) {
  if (state.shuffle) {
    const nextPosition = state.shufflePosition + direction;
    if (nextPosition >= 0 && nextPosition < state.shuffleOrder.length) {
      state.shufflePosition = nextPosition;
      return state.shuffleOrder[nextPosition];
    }
    if (state.repeatMode === "all") {
      state.shufflePosition = direction > 0 ? 0 : state.shuffleOrder.length - 1;
      return state.shuffleOrder[state.shufflePosition];
    }
    return null;
  }

  const nextIndex = state.currentIndex + direction;
  if (nextIndex >= 0 && nextIndex < state.tracks.length) return nextIndex;
  if (state.repeatMode === "all") return direction > 0 ? 0 : state.tracks.length - 1;
  return null;
}

function handleTrackEnded(elements, state, authReady) {
  if (state.repeatMode === "one") {
    elements.audio.currentTime = 0;
    playCurrentTrack(elements, state, authReady);
    return;
  }
  moveToNextTrack(elements, state, authReady);
}

async function resolveAuthUser(state) {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    state.authState = getAuthState(data.session);
    state.authUser = state.authState === "authenticated" ? data.session.user : null;
  } catch (error) {
    state.authUser = null;
    console.error("Playlist 로그인 상태를 확인하지 못했습니다.", error);
  }
}

async function requirePlaybackAccess(state, authReady) {
  await authReady;
  if (state.authUser) return true;
  window.alert(state.authState === "password-recovery" ? RECOVERY_REQUIRED_MESSAGE : LOGIN_REQUIRED_MESSAGE);
  return false;
}

function toggleShuffle(elements, state) {
  state.shuffle = !state.shuffle;
  if (state.shuffle) {
    const remaining = state.tracks.map((_, index) => index).filter((index) => index !== state.currentIndex);
    fisherYates(remaining);
    state.shuffleOrder = state.currentIndex >= 0 ? [state.currentIndex, ...remaining] : remaining;
    state.shufflePosition = state.currentIndex >= 0 ? 0 : -1;
  } else {
    state.shuffleOrder = [];
    state.shufflePosition = -1;
  }

  elements.shuffle.setAttribute("aria-pressed", String(state.shuffle));
  elements.shuffle.setAttribute("aria-label", state.shuffle ? "랜덤 재생 끄기" : "랜덤 재생 켜기");
}

function fisherYates(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
}

function syncShufflePosition(state) {
  if (!state.shuffle) return;
  const position = state.shuffleOrder.indexOf(state.currentIndex);
  if (position >= 0) state.shufflePosition = position;
}

function cycleRepeatMode(elements, state) {
  const modes = ["none", "one", "all"];
  state.repeatMode = modes[(modes.indexOf(state.repeatMode) + 1) % modes.length];
  const labels = { none: "반복 없음", one: "한 곡 반복", all: "전체 반복" };
  const label = labels[state.repeatMode];
  elements.repeat.textContent = label;
  elements.repeat.title = label;
  elements.repeat.setAttribute("aria-label", label);
  elements.repeat.setAttribute("aria-pressed", String(state.repeatMode !== "none"));
}

function toggleTrackList(elements) {
  const isOpen = elements.trackToggle.getAttribute("aria-expanded") === "true";
  elements.trackToggle.setAttribute("aria-expanded", String(!isOpen));
  elements.trackToggle.setAttribute("aria-label", isOpen ? "곡 목록 보기" : "곡 목록 닫기");
  elements.trackToggle.textContent = isOpen ? "목록 보기" : "목록 닫기";
  elements.trackList.hidden = isOpen;
}

function seekToProgress(elements) {
  const duration = elements.audio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  elements.audio.currentTime = (Number(elements.progress.value) / 1000) * duration;
}

function updateProgress(elements) {
  const duration = elements.audio.duration;
  const currentTime = Number.isFinite(elements.audio.currentTime) ? elements.audio.currentTime : 0;
  const hasDuration = Number.isFinite(duration) && duration > 0;
  elements.currentTime.textContent = formatTime(currentTime);
  elements.duration.textContent = formatTime(hasDuration ? duration : 0);
  elements.progress.value = hasDuration ? String(Math.min(1000, Math.round((currentTime / duration) * 1000))) : "0";
  elements.progress.disabled = !hasDuration;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainingSeconds}`
    : `${minutes}:${remainingSeconds}`;
}

function updatePlayButton(elements, playing) {
  elements.play.textContent = playing ? "일시정지" : "재생";
  elements.play.setAttribute("aria-label", playing ? "일시정지" : "재생");
}

function updateTrackStates(elements, state) {
  const trackButtons = elements.trackList.querySelectorAll(".playlist-track");
  trackButtons.forEach((button, index) => {
    const isCurrent = index === state.currentIndex;
    if (isCurrent) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
}

function setControlsDisabled(elements, disabled) {
  elements.previous.disabled = disabled;
  elements.play.disabled = disabled;
  elements.next.disabled = disabled;
  elements.shuffle.disabled = disabled;
  elements.repeat.disabled = disabled;
  elements.trackToggle.disabled = disabled;
  elements.progress.disabled = true;
}

function setStatus(elements, message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
}

function getTrackTitle(track) {
  return String(track.audio_title || track.title || "제목 없는 오디오").trim() || "제목 없는 오디오";
}

function getTrackArtist(track) {
  return String(track.audio_artist || "루카저널").trim() || "루카저널";
}

function getTrackMeta(track) {
  const artist = getTrackArtist(track);
  const postTitle = String(track.title || "").trim();
  return postTitle && postTitle !== getTrackTitle(track) ? `${artist} · ${postTitle}` : artist;
}

function isValidAudioUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
