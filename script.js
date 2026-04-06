/* ─────────────────────────────────────────────────────────
   BLACK RAT — script.js
   Architecture:
   • Lenis owns ALL scroll (whole page).
   • Sequence reads lenisScrollY instead of window.scrollY.
   • GSAP ScrollTrigger is fed by Lenis via lenis.on("scroll").
   • Flow-post GSAP animations work normally via ScrollTrigger.
   • Single masterRaf drives Lenis + frame interpolation tick.
───────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────
   SEQUENCE CONSTANTS
───────────────────────────────────────────────────────── */
const TOTAL_FRAMES                = 1189;
const FRAME_PADDING               = 4;
const FRAME_PATH_PREFIX           = "frames/frame_";
const FRAME_EXT                   = ".avif";
const SECONDARY_TOTAL_FRAMES      = 713;
const SECONDARY_FRAME_PADDING     = 4;
const SECONDARY_FRAME_PATH_PREFIX = "frames90/frame_";
const SECONDARY_FRAME_EXT         = ".avif";
const TOTAL_TIMELINE_FRAMES       = TOTAL_FRAMES + SECONDARY_TOTAL_FRAMES; // 1902
const BASE_SEQUENCE_HEIGHT_VH     = 1200;

const ENABLE_CUSTOM_CURSOR        = false;
const ENABLE_NOISE_OVERLAY        = false;

const ENABLE_SCROLL_INTERPOLATION           = true;
const SCROLL_INTERPOLATION_FACTOR           = 0.42;
const SECONDARY_SCROLL_INTERPOLATION_FACTOR = 0.52;
const SCROLL_SNAP_EPSILON                   = 0.015;

/* ── Text overlay frame windows ── */
const MISSION_CLEAR_UNTIL  = 175;
const MISSION_BLUR_END     = 260;
const COLLECTIVE_START     = 200;
const COLLECTIVE_END       = 600;
const PRECISION_START      = 480;
const PRECISION_END        = 840;
const PRECISION_FADE_RANGE = 60;
const REVEAL_START         = 940;
const REVEAL_END           = 1090;
const REVEAL_FADE_RANGE    = 36;
const FINALE_START         = 1120;
const FINALE_FADE_IN_RANGE = 20;
const FINALE_END           = TOTAL_FRAMES + 7;

/* ── Sequence transition ── */
const TRANSITION_PRIMARY_START_FRAME      = 1175;
const TRANSITION_PRIMARY_END_FRAME        = TOTAL_FRAMES;
const TRANSITION_TARGET_SCALE             = 1.08;
const TRANSITION_TARGET_OFFSET_X_VW      = 0.0;
const TRANSITION_TARGET_OFFSET_Y_VH      = 0.0;
const TRANSITION_SECONDARY_HOLD_FRAMES   = 8;
const TRANSITION_SECONDARY_SETTLE_FRAMES = 22;

/* ── Loader / Preload Constants ── */
const LOADER_PRELOAD_PRIMARY_COUNT   = 1189;
const LOADER_PRELOAD_SECONDARY_COUNT = 713;
const LOADER_DISMISS_PERCENT         = 72;
const LOADER_PRELOAD_BATCH_SIZE      = 32;
const LOADER_PRELOAD_BATCH_DELAY_MS  = 14;

/* ─────────────────────────────────────────────────────────
   DOM REFS
───────────────────────────────────────────────────────── */
const loaderOverlay   = document.getElementById("loader");
const loaderFill      = document.getElementById("loaderFill");
const loaderPercent   = document.getElementById("loaderPercent");
const sequenceSection = document.getElementById("sequence");
const frameViewer       = document.getElementById("frameViewer");
const missionText       = document.getElementById("missionText");
const collectiveText    = document.getElementById("collectiveText");
const precisionText     = document.getElementById("precisionText");
const revealText        = document.getElementById("revealText");
const finaleText        = document.getElementById("finaleText");
const menuBtn           = document.getElementById("menuBtn");
const navOverlay        = document.getElementById("navOverlay");
const navCard           = document.getElementById("navCard");
const navCloseBtn       = document.getElementById("navCloseBtn");
const navItems          = document.querySelectorAll(".navItem[data-frame]");
const progressFill      = document.getElementById("progressFill");
const frameCounter      = document.getElementById("frameCounter");
const frameTotalDisplay = document.getElementById("frameTotalDisplay");

if (frameTotalDisplay)
  frameTotalDisplay.textContent = String(TOTAL_TIMELINE_FRAMES).padStart(4, "0");

/* ─────────────────────────────────────────────────────────
   LOADER & AGGRESSIVE FRAME PRELOAD
───────────────────────────────────────────────────────── */
let loaderFramesLoaded = 0;
let loaderDismissed = false;

function updateLoaderProgress() {
  const total = LOADER_PRELOAD_PRIMARY_COUNT + LOADER_PRELOAD_SECONDARY_COUNT;
  const percent = Math.min(100, Math.round((loaderFramesLoaded / total) * 100));
  if (loaderFill) loaderFill.style.width = `${percent}%`;
  if (loaderPercent) loaderPercent.textContent = `${percent}%`;
  if (percent >= LOADER_DISMISS_PERCENT && !loaderDismissed && loaderOverlay) {
    loaderDismissed = true;
    setTimeout(() => {
      if (loaderOverlay) {
        loaderOverlay.classList.add("hidden");
      }
    }, 280);
  }
}

function preloadFramesForLoader() {
  let primaryCursor = 1;
  let secondaryCursor = 1;
  let primaryDone = false;
  let secondaryDone = false;

  const primBatch = () => {
    let count = 0;
    while (primaryCursor <= LOADER_PRELOAD_PRIMARY_COUNT && count < LOADER_PRELOAD_BATCH_SIZE) {
      preloadFrame("primary", primaryCursor++);
      loaderFramesLoaded++;
      count++;
    }
    updateLoaderProgress();
    if (primaryCursor > LOADER_PRELOAD_PRIMARY_COUNT) {
      primaryDone = true;
    } else {
      setTimeout(primBatch, LOADER_PRELOAD_BATCH_DELAY_MS);
    }
  };

  const secBatch = () => {
    let count = 0;
    while (secondaryCursor <= LOADER_PRELOAD_SECONDARY_COUNT && count < LOADER_PRELOAD_BATCH_SIZE) {
      preloadFrame("secondary", secondaryCursor++);
      loaderFramesLoaded++;
      count++;
    }
    updateLoaderProgress();
    if (secondaryCursor > LOADER_PRELOAD_SECONDARY_COUNT) {
      secondaryDone = true;
    } else {
      setTimeout(secBatch, LOADER_PRELOAD_BATCH_DELAY_MS);
    }
  };

  primBatch();
  setTimeout(secBatch, 140);
}

/* ─────────────────────────────────────────────────────────
   LENIS — global smooth scroll, manual raf
───────────────────────────────────────────────────────── */
const lenis = new Lenis({
  duration: 1.1,
  smoothWheel: true,
  smoothTouch: false,  // native touch inertia feels better for long scroll
  wheelMultiplier: 1.0,
  lerp: 0.1,
  autoRaf: false,      // driven by masterRaf below
});

/* Track virtual scroll position for sequence frame mapping */
let lenisScrollY = 0;
lenis.on("scroll", ({ scroll }) => {
  lenisScrollY = scroll;
  if (window.ScrollTrigger) window.ScrollTrigger.update();
});

/* ─────────────────────────────────────────────────────────
   MASTER RAF — single loop for Lenis + frame interpolation
───────────────────────────────────────────────────────── */
function masterRaf(time) {
  lenis.raf(time);
  tickFrameInterpolation();
  requestAnimationFrame(masterRaf);
}
requestAnimationFrame(masterRaf);

/* ─────────────────────────────────────────────────────────
   FRAME STATE
───────────────────────────────────────────────────────── */
let currentFrameIndex     = 0;
let currentSequence       = "primary";
let targetTimelineFrame   = 1;
let renderedTimelineFrame = 1;
let previousRenderedFrame = -1;

const frameCache                = new Map();
const PRELOAD_BEHIND            = 8;
const PRELOAD_AHEAD             = 80;
const SECONDARY_PRELOAD_BEHIND  = 20;
const SECONDARY_PRELOAD_AHEAD   = 300;
const SECONDARY_PRELOAD_TRIGGER = 40;
const SECONDARY_WARMUP_INITIAL  = 120;
const SECONDARY_WARMUP_MAX      = 713;
const SECONDARY_WARMUP_CHUNK    = 32;
const FRAME_CACHE_MAX           = 5000;
let lastPreloadCenterFrame      = -1;

/* IMAGE CACHE: Store actual Image objects to keep them in memory */
function addToCache(key, imageObj) {
  if (frameCache.has(key)) {
    const existing = frameCache.get(key);
    frameCache.delete(key);
    frameCache.set(key, { image: existing.image, time: Date.now() });
    return;
  }
  frameCache.set(key, { image: imageObj, time: Date.now() });
  
  /* Smart eviction: aggressive preload means we need a larger cache */
  if (frameCache.size > FRAME_CACHE_MAX) {
    const now = Date.now();
    let evicted = 0;
    
    /* First: remove frames older than 10+ seconds (very lenient) */
    for (const [k, data] of frameCache.entries()) {
      if (now - data.time > 10000 && evicted < 150) {
        frameCache.delete(k);
        evicted++;
      }
    }
    
    /* Second: if still over limit, remove oldest by access time */
    if (frameCache.size > FRAME_CACHE_MAX) {
      const entries = Array.from(frameCache.entries()).sort((a, b) => a[1].time - b[1].time);
      const toRemove = Math.min(300, frameCache.size - FRAME_CACHE_MAX + 200);
      for (let i = 0; i < toRemove; i++) {
        frameCache.delete(entries[i][0]);
      }
    }
  }
}

/* ─────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────── */
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function framePath(i) {
  return `${FRAME_PATH_PREFIX}${String(i).padStart(FRAME_PADDING, "0")}${FRAME_EXT}`;
}
function secondaryFramePath(i) {
  return `${SECONDARY_FRAME_PATH_PREFIX}${String(i).padStart(SECONDARY_FRAME_PADDING, "0")}${SECONDARY_FRAME_EXT}`;
}

function preloadFrame(seq, i) {
  const key = `${seq}:${i}`;
  if (frameCache.has(key)) return;
  
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  
  /* High priority for most frames during initial load */
  if (seq === "secondary") {
    img.fetchPriority = "high";
  } else if (seq === "primary" && i <= 400) {
    img.fetchPriority = "high";
  }
  
  /* Set source and keep in cache BEFORE decode */
  const srcPath = seq === "primary" ? framePath(i) : secondaryFramePath(i);
  addToCache(key, img);
  img.src = srcPath;
  
  /* Decode with error handling */
  if (typeof img.decode === "function") {
    img.decode().catch(() => {
      console.warn(`Failed to decode ${key}`);
    });
  }
}

function warmSecondarySequenceFrames() {
  /* Aggressive warmup: preload all secondary frames */
  let cursor = 1;
  let batchCount = 0;
  
  const runWarmBatch = () => {
    let n = 0;
    while (cursor <= SECONDARY_WARMUP_MAX && n < SECONDARY_WARMUP_CHUNK) {
      preloadFrame("secondary", cursor++);
      n++;
    }
    
    if (cursor <= SECONDARY_WARMUP_MAX) {
      batchCount++;
      /* Fast batching to load all frames quickly */
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(runWarmBatch, { timeout: 120 });
      } else {
        setTimeout(runWarmBatch, 6);
      }
    }
  };
  
  runWarmBatch();
}

function preloadNearbyFrames(tlf) {
  if (Math.abs(tlf - lastPreloadCenterFrame) < 1) return;
  lastPreloadCenterFrame = tlf;
  const range = (seq, center, max, behind, ahead) => {
    for (let i = center - behind; i <= center + ahead; i++)
      preloadFrame(seq, clamp(i, 1, max));
  };
  range("primary", clamp(tlf, 1, TOTAL_FRAMES), TOTAL_FRAMES, PRELOAD_BEHIND, PRELOAD_AHEAD);
  if (tlf > TOTAL_FRAMES - SECONDARY_PRELOAD_TRIGGER) {
    const sf = clamp(tlf - TOTAL_FRAMES, 1, SECONDARY_TOTAL_FRAMES);
    range("secondary", sf, SECONDARY_TOTAL_FRAMES, SECONDARY_PRELOAD_BEHIND, SECONDARY_PRELOAD_AHEAD);
  }
}

function setFrame(seq, i) {
  if (seq === currentSequence && i === currentFrameIndex) return;
  currentSequence   = seq;
  currentFrameIndex = i;
  const key = `${seq}:${i}`;
  const srcPath = seq === "primary" ? framePath(i) : secondaryFramePath(i);
  
  /* Ensure frame is cached */
  let cachedImg = null;
  if (frameCache.has(key)) {
    cachedImg = frameCache.get(key)?.image;
    frameCache.delete(key);
    frameCache.set(key, { image: cachedImg, time: Date.now() });
  } else {
    cachedImg = new Image();
    cachedImg.decoding = "async";
    cachedImg.fetchPriority = "high";
    addToCache(key, cachedImg);
  }
  
  /* Only display if image is ready (cached) or set src to load */
  if (cachedImg.complete && cachedImg.naturalWidth > 0) {
    /* Image already fully loaded, display immediately */
    frameViewer.src = srcPath;
  } else if (cachedImg.complete) {
    /* Image failed to load, try again */
    frameViewer.src = srcPath;
    cachedImg.src = srcPath;
  } else {
    /* Image still loading, wait for it */
    const onLoad = () => {
      if (currentFrameIndex === i) {
        frameViewer.src = srcPath;
      }
      cachedImg.removeEventListener("load", onLoad);
      cachedImg.removeEventListener("error", onError);
    };
    const onError = () => {
      if (currentFrameIndex === i) {
        frameViewer.src = srcPath;
      }
      cachedImg.removeEventListener("load", onLoad);
      cachedImg.removeEventListener("error", onError);
    };
    cachedImg.addEventListener("load", onLoad);
    cachedImg.addEventListener("error", onError);
    cachedImg.src = srcPath;
  }
}

/* ─────────────────────────────────────────────────────────
   SCROLL → FRAME  (reads Lenis virtual scroll Y)
───────────────────────────────────────────────────────── */
function frameFromScroll() {
  const sectionTop      = sequenceSection.offsetTop;
  const totalScrollable = sequenceSection.offsetHeight - window.innerHeight;
  if (totalScrollable <= 0) return 1;
  const inside   = clamp(lenisScrollY - sectionTop, 0, totalScrollable);
  const progress = inside / totalScrollable;
  return clamp(Math.floor(progress * (TOTAL_TIMELINE_FRAMES - 1)) + 1, 1, TOTAL_TIMELINE_FRAMES);
}

/* ─────────────────────────────────────────────────────────
   TRANSITION TRANSFORM
───────────────────────────────────────────────────────── */
function updateTransitionTransform(tlf) {
  let scale = 1, ox = 0, oy = 0;

  if (tlf >= TRANSITION_PRIMARY_START_FRAME && tlf <= TRANSITION_PRIMARY_END_FRAME) {
    const t = clamp(
      (tlf - TRANSITION_PRIMARY_START_FRAME) /
      (TRANSITION_PRIMARY_END_FRAME - TRANSITION_PRIMARY_START_FRAME), 0, 1);
    const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
    scale = 1 + (TRANSITION_TARGET_SCALE - 1) * e;
    ox    = TRANSITION_TARGET_OFFSET_X_VW * e;
    oy    = TRANSITION_TARGET_OFFSET_Y_VH * e;
  } else if (tlf > TOTAL_FRAMES) {
    const sf = tlf - TOTAL_FRAMES;
    if (sf <= TRANSITION_SECONDARY_HOLD_FRAMES) {
      scale = TRANSITION_TARGET_SCALE;
      ox    = TRANSITION_TARGET_OFFSET_X_VW;
      oy    = TRANSITION_TARGET_OFFSET_Y_VH;
    } else if (sf <= TRANSITION_SECONDARY_HOLD_FRAMES + TRANSITION_SECONDARY_SETTLE_FRAMES) {
      const st = clamp((sf - TRANSITION_SECONDARY_HOLD_FRAMES) / TRANSITION_SECONDARY_SETTLE_FRAMES, 0, 1);
      const es = 1 - Math.pow(1 - st, 3);
      scale = TRANSITION_TARGET_SCALE + (1 - TRANSITION_TARGET_SCALE) * es;
      ox    = TRANSITION_TARGET_OFFSET_X_VW * (1 - es);
      oy    = TRANSITION_TARGET_OFFSET_Y_VH * (1 - es);
    }
  }

  frameViewer.style.transform       = `translate3d(${ox.toFixed(3)}vw,${oy.toFixed(3)}vh,0) scale(${scale.toFixed(4)})`;
  frameViewer.style.transformOrigin = "50% 50%";
}

/* ─────────────────────────────────────────────────────────
   TEXT OVERLAY ANIMATIONS
───────────────────────────────────────────────────────── */
function updateMissionText(f) {
  if (!missionText) return;
  if (f <= MISSION_CLEAR_UNTIL) {
    missionText.style.setProperty("--mission-opacity", "1");
    missionText.style.setProperty("--mission-blur",    "0px");
    missionText.style.setProperty("--mission-lift",    "0px");
    return;
  }
  const p = clamp((f - MISSION_CLEAR_UNTIL) / (MISSION_BLUR_END - MISSION_CLEAR_UNTIL), 0, 1);
  missionText.style.setProperty("--mission-opacity", (1-p).toFixed(3));
  missionText.style.setProperty("--mission-blur",    `${(p*14).toFixed(2)}px`);
  missionText.style.setProperty("--mission-lift",    `${(-p*10).toFixed(2)}px`);
}

function updateCollectiveText(f) {
  if (!collectiveText) return;
  if (f < COLLECTIVE_START || f > COLLECTIVE_END) {
    collectiveText.style.setProperty("--collective-opacity", "0");
    collectiveText.style.setProperty("--collective-blur",    "14px");
    collectiveText.style.setProperty("--collective-lift",    "8px");
    return;
  }
  const mid = (COLLECTIVE_START + COLLECTIVE_END) / 2;
  const hr  = (COLLECTIVE_END - COLLECTIVE_START) / 2;
  const n   = clamp(1 - Math.abs(f - mid) / hr, 0, 1);
  collectiveText.style.setProperty("--collective-opacity", n.toFixed(3));
  collectiveText.style.setProperty("--collective-blur",    `${((1-n)*14).toFixed(2)}px`);
  collectiveText.style.setProperty("--collective-lift",    `${((1-n)*8).toFixed(2)}px`);
}

function updatePrecisionText(f) {
  if (!precisionText) return;
  if (f < PRECISION_START || f > PRECISION_END) {
    precisionText.style.setProperty("--precision-opacity", "0");
    precisionText.style.setProperty("--precision-blur",    "14px");
    precisionText.style.setProperty("--precision-lift",    "8px");
    return;
  }
  let n = 1;
  if (f <= PRECISION_START + PRECISION_FADE_RANGE)
    n = clamp((f - PRECISION_START) / PRECISION_FADE_RANGE, 0, 1);
  else if (f >= PRECISION_END - PRECISION_FADE_RANGE)
    n = clamp((PRECISION_END - f) / PRECISION_FADE_RANGE, 0, 1);
  precisionText.style.setProperty("--precision-opacity", n.toFixed(3));
  precisionText.style.setProperty("--precision-blur",    `${((1-n)*14).toFixed(2)}px`);
  precisionText.style.setProperty("--precision-lift",    `${((1-n)*8).toFixed(2)}px`);
}

function updateRevealText(f) {
  if (!revealText) return;
  if (f < REVEAL_START || f > REVEAL_END) {
    revealText.style.setProperty("--reveal-opacity",      "0");
    revealText.style.setProperty("--reveal-blur",         "14px");
    revealText.style.setProperty("--reveal-lift",         "8px");
    revealText.style.setProperty("--reveal-copy-opacity", "0");
    revealText.style.setProperty("--reveal-copy-blur",    "14px");
    return;
  }
  let n = 1;
  if (f <= REVEAL_START + REVEAL_FADE_RANGE)
    n = clamp((f - REVEAL_START) / REVEAL_FADE_RANGE, 0, 1);
  revealText.style.setProperty("--reveal-opacity",      n.toFixed(3));
  revealText.style.setProperty("--reveal-blur",         `${((1-n)*14).toFixed(2)}px`);
  revealText.style.setProperty("--reveal-lift",         `${((1-n)*8).toFixed(2)}px`);
  revealText.style.setProperty("--reveal-copy-opacity", "1");
  revealText.style.setProperty("--reveal-copy-blur",    "0px");
}

function updateFinaleText(tlf) {
  if (!finaleText) return;
  if (tlf < FINALE_START || tlf > FINALE_END) {
    finaleText.style.setProperty("--finale-opacity", "0");
    finaleText.style.setProperty("--finale-blur",    "14px");
    finaleText.style.setProperty("--finale-lift",    "8px");
    return;
  }
  let n = 1;
  if (tlf <= FINALE_START + FINALE_FADE_IN_RANGE)
    n = clamp((tlf - FINALE_START) / FINALE_FADE_IN_RANGE, 0, 1);
  finaleText.style.setProperty("--finale-opacity", n.toFixed(3));
  finaleText.style.setProperty("--finale-blur",    `${((1-n)*14).toFixed(2)}px`);
  finaleText.style.setProperty("--finale-lift",    `${((1-n)*8).toFixed(2)}px`);
}

/* ─────────────────────────────────────────────────────────
   APPLY FRAME STATE
───────────────────────────────────────────────────────── */
function applyFrameState(tlf) {
  tlf <= TOTAL_FRAMES
    ? setFrame("primary", tlf)
    : setFrame("secondary", tlf - TOTAL_FRAMES);

  updateTransitionTransform(tlf);
  updateMissionText(tlf);
  updateCollectiveText(tlf);
  updatePrecisionText(tlf);
  updateRevealText(tlf);
  updateFinaleText(tlf);

  if (frameCounter)
    frameCounter.textContent = String(tlf).padStart(4, "0");
  if (progressFill)
    progressFill.style.width = `${(((tlf - 1) / (TOTAL_TIMELINE_FRAMES - 1)) * 100).toFixed(2)}%`;
}

/* ─────────────────────────────────────────────────────────
   FRAME INTERPOLATION TICK  (called every rAF from masterRaf)
───────────────────────────────────────────────────────── */
function tickFrameInterpolation() {
  /* Skip when scrolled past the sequence */
  const sectionTop    = sequenceSection.offsetTop;
  const sectionBottom = sectionTop + sequenceSection.offsetHeight;
  if (lenisScrollY > sectionBottom + window.innerHeight) return;

  targetTimelineFrame = frameFromScroll();

  if (ENABLE_SCROLL_INTERPOLATION) {
    const delta       = targetTimelineFrame - renderedTimelineFrame;
    const inSecondary = targetTimelineFrame > TOTAL_FRAMES || renderedTimelineFrame > TOTAL_FRAMES;
    const factor      = inSecondary ? SECONDARY_SCROLL_INTERPOLATION_FACTOR : SCROLL_INTERPOLATION_FACTOR;
    if (Math.abs(delta) < SCROLL_SNAP_EPSILON)
      renderedTimelineFrame = targetTimelineFrame;
    else
      renderedTimelineFrame += delta * factor;
  } else {
    renderedTimelineFrame = targetTimelineFrame;
  }

  const tlf = clamp(Math.round(renderedTimelineFrame), 1, TOTAL_TIMELINE_FRAMES);
  if (tlf !== previousRenderedFrame) {
    previousRenderedFrame = tlf;
    applyFrameState(tlf);
    preloadNearbyFrames(tlf);
  }
}

/* ─────────────────────────────────────────────────────────
   NAVIGATION HELPERS
───────────────────────────────────────────────────────── */
function scrollToTimelineFrame(frameIndex) {
  const f             = clamp(frameIndex, 1, TOTAL_TIMELINE_FRAMES);
  const totalScrollable = sequenceSection.offsetHeight - window.innerHeight;
  const progress      = (f - 1) / (TOTAL_TIMELINE_FRAMES - 1);
  const targetTop     = sequenceSection.offsetTop + progress * totalScrollable;
  lenis.scrollTo(targetTop, { duration: 1.2 });
}

function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    const top = section.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.05;
    lenis.scrollTo(Math.max(0, top), { duration: 1.2 });
  }
}

/* ─────────────────────────────────────────────────────────
   NAV
───────────────────────────────────────────────────────── */
function setNavOpen(isOpen) {
  if (!navOverlay) return;
  navOverlay.classList.toggle("open", isOpen);
  navOverlay.setAttribute("aria-hidden", String(!isOpen));
  menuBtn?.setAttribute("aria-expanded", String(isOpen));
  isOpen ? lenis.stop() : lenis.start();
  document.body.style.overflow = isOpen ? "hidden" : "";
}

if (menuBtn && navOverlay) {
  menuBtn.addEventListener("click", () => setNavOpen(!navOverlay.classList.contains("open")));
  navOverlay.addEventListener("click", (e) => { if (e.target === navOverlay) setNavOpen(false); });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && navOverlay.classList.contains("open")) setNavOpen(false);
  });
}

if (navCloseBtn) {
  navCloseBtn.addEventListener("click", () => { setNavOpen(false); scrollToTimelineFrame(1); });
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const frame = Number(item.dataset.frame);
    if (Number.isFinite(frame)) scrollToTimelineFrame(frame);
    setNavOpen(false);
  });
});

document.querySelectorAll(".navItem.nav-section[data-section]").forEach((item) => {
  item.addEventListener("click", () => {
    scrollToSection(item.dataset.section);
    setNavOpen(false);
  });
});

document.querySelectorAll(".founder-name").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const href = link.getAttribute("href");
    if (href && href !== "#") window.location.href = href;
  });
});

/* ─────────────────────────────────────────────────────────
   CUSTOM CURSOR
───────────────────────────────────────────────────────── */
const cursorDot  = document.getElementById("cursorDot");
const cursorRing = document.getElementById("cursorRing");
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

if (ENABLE_CUSTOM_CURSOR && cursorDot && cursorRing) {
  document.addEventListener("mousemove", (e) => { mouseX = e.clientX; mouseY = e.clientY; });
  document.querySelectorAll("button, a, .navItem").forEach((el) => {
    el.addEventListener("mouseenter", () => document.body.classList.add("cursor-hover"));
    el.addEventListener("mouseleave", () => document.body.classList.remove("cursor-hover"));
  });
  (function animateCursor() {
    ringX += (mouseX - ringX) * 0.12;
    ringY += (mouseY - ringY) * 0.12;
    cursorDot.style.transform  = `translate(calc(${mouseX}px - 50%), calc(${mouseY}px - 50%))`;
    cursorRing.style.transform = `translate(calc(${ringX}px - 50%), calc(${ringY}px - 50%))`;
    requestAnimationFrame(animateCursor);
  })();
}

/* ─────────────────────────────────────────────────────────
   NOISE CANVAS
───────────────────────────────────────────────────────── */
(function initNoise() {
  if (!ENABLE_NOISE_OVERLAY) return;
  const canvas = document.getElementById("noiseCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let tick = 0;
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  function render() {
    if (++tick % 3 === 0) {
      const id = ctx.createImageData(canvas.width, canvas.height);
      const d  = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255;
      }
      ctx.putImageData(id, 0, 0);
    }
    requestAnimationFrame(render);
  }
  resize();
  window.addEventListener("resize", resize);
  render();
})();

/* ─────────────────────────────────────────────────────────
   FLOW-POST GSAP SCROLL EFFECTS
   Lenis feeds ScrollTrigger via the lenis.on("scroll") above.
───────────────────────────────────────────────────────── */
(function initFlowPostEffects() {
  const flowRoot = document.querySelector(".flow-post");
  if (!flowRoot || !(window.gsap && window.ScrollTrigger)) return;

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  gsap.ticker.lagSmoothing(0);

  const sections = gsap.utils.toArray(".flow-post .flow-section");
  sections.forEach((section, i) => {
    const container = section.querySelector(".flow-container");
    if (!container) return;

    if (i > 0) {
      gsap.set(container, { rotation: 30 });
      gsap.to(container, {
        rotation: 0,
        ease: "none",
        scrollTrigger: { trigger: section, start: "top bottom", end: "top 25%", scrub: true },
      });
    }

    if (i < sections.length - 1) {
      ScrollTrigger.create({
        trigger: section,
        start: "bottom bottom",
        end: "bottom top",
        pin: true,
        pinSpacing: false,
      });
    }
  });
})();

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
sequenceSection.style.height = `${Math.round(
  (BASE_SEQUENCE_HEIGHT_VH * TOTAL_TIMELINE_FRAMES) / TOTAL_FRAMES
)}vh`;

setFrame("primary", 1);
frameViewer.loading       = "eager";
frameViewer.decoding      = "async";
frameViewer.fetchPriority = "high";

renderedTimelineFrame = 1;
targetTimelineFrame   = 1;
updateTransitionTransform(1);
updateMissionText(1);
updateCollectiveText(1);
updatePrecisionText(1);
updateRevealText(1);
updateFinaleText(1);
preloadNearbyFrames(1);
for (let i = 2; i <= 80; i++) preloadFrame("primary", i);
warmSecondarySequenceFrames();
preloadFramesForLoader();

window.addEventListener("resize", () => {
  if (window.ScrollTrigger) window.ScrollTrigger.refresh();
}, { passive: true });

/* Allow user to dismiss loader early by clicking or pressing any key */
if (loaderOverlay) {
  loaderOverlay.addEventListener("click", () => {
    if (!loaderDismissed) {
      loaderDismissed = true;
      loaderOverlay.classList.add("hidden");
    }
  });
}
document.addEventListener("keydown", () => {
  if (!loaderDismissed && loaderOverlay) {
    loaderDismissed = true;
    loaderOverlay.classList.add("hidden");
  }
}, { once: true });