import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const nebRoot = 'F:/NEB'

const documentJson = JSON.parse(
  await readFile(path.join(root, 'src/features/studio/defaultStudioDocument.json'), 'utf8')
)

const nebyAvatar =
  documentJson.library.avatars.find(a => a.id === 'avatar-neby') || documentJson.library.avatars[0]

// Load standalone engine bundle
const engineGenerated = await readFile(
  path.join(root, 'src/features/export/standaloneEngine.generated.ts'),
  'utf8'
)
// Extract the IIFE string
const match = engineGenerated.match(/standaloneEngineSource\s*=\s*(".*"|'.*')/s)
let engineCode = ''
if (match) {
  engineCode = JSON.parse(match[1])
} else {
  throw new Error('Failed to extract standaloneEngineSource')
}

// Execute bundled engine to get the full, latest studio expressions and sequences
const sandbox = { window: {}, process: { env: { NODE_ENV: 'production' } }, console }
vm.createContext(sandbox)
vm.runInContext(engineCode, sandbox)
const engineExports = sandbox.AvatarProceduralEngine || sandbox.window?.AvatarProceduralEngine || {}

const allExpressions = engineExports.initialExpressions || documentJson.expressions
const allSequences =
  typeof engineExports.createInitialSequences === 'function'
    ? engineExports.createInitialSequences()
    : documentJson.sequences

// Also sync defaultStudioDocument.json so the file itself contains the full suite
documentJson.expressions = allExpressions
documentJson.sequences = allSequences
await writeFile(
  path.join(root, 'src/features/studio/defaultStudioDocument.json'),
  JSON.stringify(documentJson, null, 2)
)

// Build the export payload with all expressions and sequences
const expressionMap = Object.fromEntries(allExpressions.map(e => [e.id, e]))
const animationMap = {}
for (const seq of allSequences) {
  const key = seq.id || seq.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  animationMap[key] = {
    name: seq.name,
    description: seq.description,
    playbackMode: seq.playbackMode,
    blink: seq.blink,
    steps: seq.steps.map(s => ({
      expressionId: s.expressionId,
      holdMs: s.holdMs,
      transitionMs: s.transitionMs,
      transition: s.transition,
    })),
  }
}

const payload = {
  avatar: {
    name: nebyAvatar.name,
    surface: nebyAvatar.body.primary,
    bodyNodes: nebyAvatar.body.nodes,
    colors: nebyAvatar.colors,
  },
  expressions: expressionMap,
  animations: animationMap,
}

// Client runtime script for Neby Interactive Avatar
const runtimeCode = `
(function(window, document) {
  'use strict';

  ${engineCode}

  const NEBY_DATA = ${JSON.stringify(payload)};

  const SVG_NS = 'http://www.w3.org/2000/svg';
  let instanceCount = 0;

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeProgress = (p, transition) => {
    if (transition === 'smooth') return p * p * (3 - 2 * p);
    if (transition === 'snappy') return 1 - Math.pow(1 - p, 3);
    return 1 - Math.exp(-6 * p) * Math.cos(8 * p);
  };

  const nearestAngle = (target, current) => {
    let resolved = target;
    while (resolved - current > 180) resolved -= 360;
    while (resolved - current < -180) resolved += 360;
    return resolved;
  };

  const resolvedTargetExpression = (target, current) => ({
    ...target,
    headX: nearestAngle(target.headX, current.headX),
    headY: nearestAngle(target.headY, current.headY),
    headZ: nearestAngle(target.headZ, current.headZ),
    leftAngle: nearestAngle(target.leftAngle, current.leftAngle),
    rightAngle: nearestAngle(target.rightAngle, current.rightAngle),
  });

  const colorChannels = color => {
    const val = (color || '#000000').replace('#', '');
    const hex = val.length === 3 ? val.split('').map(c => c + c).join('') : val;
    const num = parseInt(hex, 16) || 0;
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  };

  const interpolateColor = (from, to, progress) => {
    const l = colorChannels(from);
    const r = colorChannels(to);
    const val = l.map((c, i) => Math.round(c + (r[i] - c) * progress));
    return '#' + val.map(c => c.toString(16).padStart(2, '0')).join('');
  };

  const resolveColors = expr => ({
    body: (expr && expr.bodyColor) || NEBY_DATA.avatar.colors.body,
    eyes: (expr && expr.eyeColor) || NEBY_DATA.avatar.colors.eyes,
  });

  const svgElement = name => document.createElementNS(SVG_NS, name);

  function createNebyInstance(container, options = {}) {
    if (!container) return null;
    const instanceId = ++instanceCount;
    const clipId = 'neby-clip-' + instanceId;
    const isHero = Boolean(options.hero || container.classList.contains('neby-avatar-hero'));
    const isInteractive = options.interactive !== false;

    container.classList.add('neby-avatar-container');
    if (isHero) container.classList.add('neby-hero-mode');

    const svg = svgElement('svg');
    svg.setAttribute('viewBox', '-150 -150 300 300');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Interactive Neby 3D Avatar');
    svg.classList.add('neby-avatar-svg');

    const defs = svgElement('defs');
    const clipPath = svgElement('clipPath');
    clipPath.id = clipId;
    const clipHead = svgElement('path');
    clipPath.append(clipHead);
    defs.append(clipPath);
    svg.append(defs);

    const motionLayer = svgElement('g');
    motionLayer.setAttribute('class', 'neby-motion-layer');

    const backLayer = svgElement('g');
    const head = svgElement('path');
    head.setAttribute('class', 'neby-head-base');

    const decalsLayer = svgElement('g');
    decalsLayer.setAttribute('class', 'neby-decals-layer');

    const eyesLayer = svgElement('g');
    eyesLayer.setAttribute('clip-path', 'url(#' + clipId + ')');
    const leftEye = svgElement('path');
    const rightEye = svgElement('path');
    eyesLayer.append(leftEye, rightEye);

    const mouth = svgElement('path');
    mouth.setAttribute('class', 'neby-mouth-path');
    mouth.setAttribute('fill', 'none');
    mouth.setAttribute('stroke-linecap', 'round');
    mouth.setAttribute('stroke-linejoin', 'round');

    const frontLayer = svgElement('g');
    const orbitalFrontLayer = svgElement('g');
    orbitalFrontLayer.setAttribute('class', 'neby-orbital-front');

    const orbitalBackLayer = svgElement('g');
    orbitalBackLayer.setAttribute('class', 'neby-orbital-back');

    const effectsLayer = svgElement('g');
    effectsLayer.setAttribute('class', 'neby-effects-layer');

    motionLayer.append(backLayer, orbitalBackLayer, head, decalsLayer, eyesLayer, mouth, frontLayer, orbitalFrontLayer);
    svg.append(motionLayer, effectsLayer);
    container.innerHTML = '';
    container.append(svg);

    const ensurePaths = (group, paths, fill) => {
      while (group.children.length < paths.length) group.append(svgElement('path'));
      while (group.children.length > paths.length) group.lastElementChild.remove();
      paths.forEach((p, idx) => {
        const el = group.children[idx];
        el.setAttribute('d', p);
        el.setAttribute('fill', fill);
      });
    };

    const ensureDecals = (group, decals) => {
      while (group.children.length < decals.length) group.append(svgElement('path'));
      while (group.children.length > decals.length) group.lastElementChild.remove();
      decals.forEach((decal, idx) => {
        const el = group.children[idx];
        el.setAttribute('d', decal.path);
        el.setAttribute('fill', decal.fill);
        el.setAttribute('opacity', decal.opacity != null ? decal.opacity : 1);
      });
    };

    const animationNames = Object.keys(NEBY_DATA.animations);
    let currentAnimation = options.animation && NEBY_DATA.animations[options.animation]
      ? options.animation
      : (isHero ? 'idle' : 'idle');
    if (!NEBY_DATA.animations[currentAnimation]) currentAnimation = animationNames[0];

    const initialStep = NEBY_DATA.animations[currentAnimation].steps[0];
    const initialExpression = NEBY_DATA.expressions[initialStep.expressionId] || Object.values(NEBY_DATA.expressions)[0];

    let currentPose = AvatarProceduralEngine.poseFromExpression(initialExpression);
    let currentColors = resolveColors(initialExpression);
    let blinkAmount = 1;
    let transitionState = null;
    let blinkState = null;
    let frameRequest = null;
    let stepTimer = null;
    let blinkTimer = null;
    let blinkDueAt = null;
    let stepIndex = 0;
    let direction = 1;
    let playing = true;
    let paused = false;
    let stepDueAt = null;

    let eyeAmbientStartedAt = performance.now();
    let bodyAmbientStartedAt = performance.now();
    let eyeAmbientSignature = initialExpression.eyeMotion || 'microSaccades';
    let bodyAmbientSignature = initialExpression.bodyMotion || 'gentle';
    let ambientStrength = 1;
    let lastAmbientFrame = 0;

    // Look-at cursor tracking
    let cursorTargetX = 0;
    let cursorTargetY = 0;
    let cursorCurrentX = 0;
    let cursorCurrentY = 0;
    let isMouseOver = false;

    const render = (time = performance.now()) => {
      const eyeElapsed = time - eyeAmbientStartedAt;
      const bodyElapsed = time - bodyAmbientStartedAt;

      // Blend look-at offset
      cursorCurrentX += (cursorTargetX - cursorCurrentX) * 0.12;
      cursorCurrentY += (cursorTargetY - cursorCurrentY) * 0.12;

      let expr = { ...currentPose.expression };
      if (Math.abs(cursorCurrentX) > 0.001 || Math.abs(cursorCurrentY) > 0.001) {
        expr.headY = (expr.headY || 0) + cursorCurrentX * 18;
        expr.headX = (expr.headX || 0) - cursorCurrentY * 14;
        expr.positionXLeft = (expr.positionXLeft || 0) + cursorCurrentX * 4;
        expr.positionXRight = (expr.positionXRight || 0) + cursorCurrentX * 4;
      }

      if (expr.bodyMotion && expr.bodyMotion !== 'none') {
        expr = AvatarProceduralEngine.applyAmbientBodyMotion(expr, bodyElapsed, ambientStrength);
      }

      const eyeOffset = AvatarProceduralEngine.ambientEyeOffset(expr, eyeElapsed, ambientStrength);
      const renderedPose = AvatarProceduralEngine.poseFromExpression(expr);
      const geometry = AvatarProceduralEngine.renderAvatar(renderedPose, NEBY_DATA.avatar.surface, blinkAmount, {
        includeWire: false,
        bodyNodes: NEBY_DATA.avatar.bodyNodes,
        eyeOffset,
      });

      const bodyOffset = AvatarProceduralEngine.ambientBodyOffset(expr, bodyElapsed, ambientStrength);
      motionLayer.setAttribute('transform', 'translate(' + bodyOffset.x + ' ' + bodyOffset.y + ')');

      ensurePaths(backLayer, geometry.backPaths || [], currentColors.body);
      ensurePaths(frontLayer, geometry.frontPaths || [], currentColors.body);

      head.setAttribute('d', geometry.headPath || '');
      head.setAttribute('fill', currentColors.body);
      clipHead.setAttribute('d', geometry.headPath || '');

      ensureDecals(decalsLayer, geometry.decals || []);

      leftEye.setAttribute('d', geometry.leftPath || '');
      rightEye.setAttribute('d', geometry.rightPath || '');
      leftEye.setAttribute('fill', currentColors.eyes);
      rightEye.setAttribute('fill', currentColors.eyes);
      leftEye.style.display = geometry.leftVisible ? '' : 'none';
      rightEye.style.display = geometry.rightVisible ? '' : 'none';

      if (geometry.mouthVisible && geometry.mouthPath) {
        mouth.setAttribute('d', geometry.mouthPath);
        mouth.setAttribute('stroke', currentColors.eyes);
        mouth.setAttribute('stroke-width', (2.8 * (expr.mouthScale || 1)).toFixed(1));
        mouth.style.display = '';
      } else {
        mouth.style.display = 'none';
      }

      if (expr.effect && expr.effect !== 'none' && typeof AvatarProceduralEngine.avatarEffectSvgMarkup === 'function') {
        effectsLayer.innerHTML = AvatarProceduralEngine.avatarEffectSvgMarkup(expr.effect) || '';
      } else {
        effectsLayer.innerHTML = '';
      }
    };

    const tick = time => {
      frameRequest = null;
      if (transitionState) {
        const linear = clamp01((time - transitionState.startedAt) / transitionState.durationMs);
        const eased = easeProgress(linear, transitionState.transition);
        ambientStrength = clamp01(eased);
        const expression = { ...transitionState.fromPose.expression };
        AvatarProceduralEngine.expressionFields.forEach(field => {
          const fromVal = transitionState.fromPose.expression[field] || 0;
          const toVal = transitionState.toPose.expression[field] || 0;
          expression[field] = fromVal + (toVal - fromVal) * eased;
        });
        expression.eyeMotion = transitionState.toPose.expression.eyeMotion;
        expression.bodyMotion = transitionState.toPose.expression.bodyMotion;
        expression.mouth = transitionState.toPose.expression.mouth;
        expression.mouthScale = transitionState.toPose.expression.mouthScale;
        currentPose = AvatarProceduralEngine.poseFromExpression(expression);
        currentColors = {
          body: interpolateColor(transitionState.fromColors.body, transitionState.toColors.body, clamp01(eased)),
          eyes: interpolateColor(transitionState.fromColors.eyes, transitionState.toColors.eyes, clamp01(eased)),
        };
        if (linear >= 1) {
          currentPose = transitionState.toPose;
          currentColors = transitionState.toColors;
          transitionState = null;
          eyeAmbientStartedAt = time;
          bodyAmbientStartedAt = time;
          ambientStrength = 1;
        }
      }

      if (blinkState) {
        const elapsed = time - blinkState.startedAt;
        const half = blinkState.durationMs / 2;
        if (elapsed < half) {
          blinkAmount = 1 - elapsed / half;
        } else if (elapsed < blinkState.durationMs) {
          blinkAmount = (elapsed - half) / half;
        } else {
          blinkAmount = 1;
          blinkState = null;
        }
      }

      render(time);

      if (playing || transitionState || blinkState || isMouseOver || (currentPose && currentPose.expression && currentPose.expression.bodyMotion !== 'none')) {
        requestTick();
      }
    };

    const requestTick = () => {
      if (frameRequest === null && !paused) {
        frameRequest = requestAnimationFrame(tick);
      }
    };

    const animateTo = (expressionId, durationMs = 300, transition = 'spring') => {
      const targetExpression = NEBY_DATA.expressions[expressionId] || Object.values(NEBY_DATA.expressions)[0];
      const targetColors = resolveColors(targetExpression);
      const startExpression = transitionState
        ? currentPose.expression
        : (currentAnimation && NEBY_DATA.animations[currentAnimation] && NEBY_DATA.animations[currentAnimation].steps[stepIndex]
            ? NEBY_DATA.expressions[NEBY_DATA.animations[currentAnimation].steps[stepIndex].expressionId] || currentPose.expression
            : currentPose.expression);
      const startColors = transitionState ? currentColors : resolveColors(startExpression);
      const resolvedTarget = resolvedTargetExpression(targetExpression, startExpression);

      transitionState = {
        startedAt: performance.now(),
        durationMs: durationMs,
        fromPose: AvatarProceduralEngine.poseFromExpression(startExpression),
        toPose: AvatarProceduralEngine.poseFromExpression(resolvedTarget),
        fromColors: startColors,
        toColors: targetColors,
        transition: transition || 'spring',
        expressionId,
      };
      ambientStrength = 0;
      requestTick();
    };

    const scheduleBlink = (anim, delay) => {
      if (!anim.blink || !anim.blink.enabled) return;
      blinkDueAt = performance.now() + delay;
      blinkTimer = setTimeout(() => {
        blinkDueAt = null;
        blinkState = { startedAt: performance.now(), durationMs: anim.blink.durationMs || 120 };
        requestTick();
        const minI = anim.blink.minIntervalMs || 2200;
        const maxI = anim.blink.maxIntervalMs || 6000;
        const range = maxI - minI;
        scheduleBlink(anim, (anim.blink.durationMs || 120) + minI + Math.random() * range);
      }, delay);
    };

    const advance = anim => {
      const last = anim.steps.length - 1;
      const mode = anim.playbackMode || 'loop';
      if (mode === 'once' && stepIndex >= last) return;
      if (mode === 'pingPong' && last > 0) {
        if (stepIndex >= last) direction = -1;
        else if (stepIndex <= 0) direction = 1;
        stepIndex += direction;
      } else {
        stepIndex = (stepIndex + 1) % (last + 1);
      }
      runStep(anim);
    };

    const runStep = anim => {
      if (!playing || !anim.steps.length) return;
      const step = anim.steps[stepIndex];
      animateTo(step.expressionId, step.transitionMs, step.transition);
      const duration = step.transitionMs + step.holdMs;
      stepDueAt = performance.now() + duration;
      stepTimer = setTimeout(() => advance(anim), duration);
    };

    const clearSchedule = () => {
      if (stepTimer !== null) clearTimeout(stepTimer);
      if (blinkTimer !== null) clearTimeout(blinkTimer);
      stepTimer = null;
      blinkTimer = null;
    };

    const playSequence = name => {
      const anim = NEBY_DATA.animations[name] || NEBY_DATA.animations['idle'];
      if (!anim) return;
      clearSchedule();
      currentAnimation = name;
      stepIndex = 0;
      direction = 1;
      playing = true;
      runStep(anim);
      scheduleBlink(anim, (anim.blink && anim.blink.initialDelayMs) || 1500);
      requestTick();
    };

    // Playful rich reaction animations
    const triggerReaction = type => {
      let animName = 'celebrate';
      if (type === 'wink') animName = 'wink';
      else if (type === 'joy' || type === 'celebrate' || type === 'happy') animName = 'celebrate';
      else if (type === 'think' || type === 'focus' || type === 'scanning' || type === 'searching') animName = 'scanning';
      else if (type === 'talk' || type === 'speaking' || type === 'chat') animName = 'speaking';
      else if (type === 'dance' || type === 'groove') animName = 'dance';
      else if (type === 'love' || type === 'heart') animName = 'love';
      else if (type === 'kiss' || type === 'smooch') animName = 'kiss';
      else if (type === 'agree' || type === 'nod' || type === 'yes' || type === 'affirm') animName = 'agree';
      else if (type === 'disagree' || type === 'no' || type === 'skeptical') animName = 'disagree';
      else if (type === 'angry' || type === 'mad' || type === 'hot') animName = 'angry';
      else if (type === 'sleepy' || type === 'sleep' || type === 'tired' || type === 'nap') animName = 'sleeping';
      else if (type === 'laugh' || type === 'laughing' || type === 'playful') animName = 'laughing';
      else if (type === 'proud') animName = 'proud';
      else if (type === 'shy') animName = 'shy';
      else if (type === 'dizzy') animName = 'dizzy';
      else if (type === 'orbit') animName = 'orbit';
      else if (type === 'play') animName = 'play';
      else if (type === 'notification' || type === 'alert') animName = 'notification';
      else if (NEBY_DATA.animations[type]) animName = type;

      if (NEBY_DATA.animations[animName]) {
        playSequence(animName);
        if (animName !== 'idle') {
          setTimeout(() => {
            if (currentAnimation === animName) {
              playSequence('idle');
            }
          }, 3400);
        }
      } else if (NEBY_DATA.expressions[type]) {
        animateTo(type, 180, 'spring');
        stepTimer = setTimeout(() => {
          playSequence('idle');
        }, 1200);
      }
    };

    // Interactivity handlers
    if (isInteractive) {
      const onMouseMove = e => {
        const rect = container.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const range = isHero ? Math.max(window.innerWidth, window.innerHeight) * 0.7 : rect.width * 4;
        const dx = (e.clientX - cx) / range;
        const dy = (e.clientY - cy) / range;
        cursorTargetX = Math.max(-1, Math.min(1, dx));
        cursorTargetY = Math.max(-1, Math.min(1, dy));
        requestTick();
      };

      const onMouseEnter = () => {
        isMouseOver = true;
      };

      const onMouseLeave = () => {
        isMouseOver = false;
        cursorTargetX = 0;
        cursorTargetY = 0;
        requestTick();
      };

      const onClick = () => {
        const reactions = [
          'wink', 'love', 'kiss', 'celebrate', 'dance', 'speaking', 
          'scanning', 'agree', 'disagree', 'laughing', 'proud', 'shy', 'sleepy', 'dizzy'
        ];
        const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
        triggerReaction(randomReaction);
      };

      if (isHero) {
        window.addEventListener('mousemove', onMouseMove, { passive: true });
      } else {
        container.addEventListener('mousemove', onMouseMove, { passive: true });
      }
      container.addEventListener('mouseenter', onMouseEnter);
      container.addEventListener('mouseleave', onMouseLeave);
      container.addEventListener('click', onClick);
    }

    // Visibility Observer to save battery / CPU when offscreen
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            if (!playing) {
              playing = true;
              playSequence(currentAnimation);
            }
          } else {
            playing = false;
            clearSchedule();
          }
        });
      }, { threshold: 0.05 });
      observer.observe(container);
    }

    playSequence(currentAnimation);

    return {
      container,
      svg,
      play: playSequence,
      react: triggerReaction,
      setLookAt: (x, y) => {
        cursorTargetX = Math.max(-1, Math.min(1, x));
        cursorTargetY = Math.max(-1, Math.min(1, y));
        requestTick();
      },
      destroy: () => {
        playing = false;
        clearSchedule();
        if (frameRequest) cancelAnimationFrame(frameRequest);
        container.innerHTML = '';
      }
    };
  }

  function initAll() {
    document.querySelectorAll('[data-neby-avatar]:not([data-neby-initialized])').forEach(el => {
      el.setAttribute('data-neby-initialized', 'true');
      const anim = el.getAttribute('data-animation') || 'idle';
      const isHero = el.getAttribute('data-hero') === 'true' || el.classList.contains('neby-avatar-hero');
      const instance = createNebyInstance(el, {
        animation: anim,
        hero: isHero,
        interactive: true,
      });
      el.__nebyInstance = instance;
    });
  }

  // Auto-init on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // MutationObserver for dynamic DOM updates (HTMX, fetch, threads, websockets)
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function (mutations) {
      var shouldInit = false;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length > 0) {
          shouldInit = true;
          break;
        }
      }
      if (shouldInit) initAll();
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  }

  // Delegated CSP-compliant handler for reaction buttons
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-neby-react]');
    if (btn) {
      var mood = btn.getAttribute('data-neby-react');
      var targetId = btn.getAttribute('data-neby-target') || 'profilePageNebyAvatar';
      var targetEl = document.getElementById(targetId) || document.querySelector('[data-hero="true"]') || document.querySelector('[data-neby-avatar]');
      if (targetEl && targetEl.__nebyInstance) {
        targetEl.__nebyInstance.react(mood);
      }
    }
  });

  window.NebyAvatar = {
    mount: createNebyInstance,
    initAll: initAll,
    data: NEBY_DATA,
  };

})(window, document);
`

// CSS for Neby Avatar
const cssCode = `
/* 3D Interactive Neby Avatar System */
.neby-avatar-container {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: visible;
  user-select: none;
  cursor: pointer;
  vertical-align: middle;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.neby-avatar-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
  filter: none !important;
  box-shadow: none !important;
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.neby-avatar-container:hover .neby-avatar-svg {
  transform: scale(1.08) translateY(-1px);
  filter: none !important;
}

.neby-avatar-container:active .neby-avatar-svg {
  transform: scale(0.95);
}

/* Mini Avatar inside forum posts, comments, contributors list */
.neby-avatar-mini {
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 50%;
  background: var(--md-surface-container-lowest, #ffffff);
  border: 1.5px solid var(--md-outline-variant, rgba(0, 0, 0, 0.08));
  box-shadow: none !important;
  filter: none !important;
  box-sizing: border-box;
}

.fp-reply-avatar .neby-avatar-mini,
.neby-avatar-mini.neby-size-reply {
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 34px;
}

.neby-avatar-mini.neby-size-sm {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
}

/* Large Hero Avatar on Neby Profile Page */
.neby-avatar-hero {
  width: 140px;
  height: 140px;
  min-width: 140px;
  min-height: 140px;
  border-radius: 50%;
  background: var(--md-surface-container-lowest, #ffffff);
  border: 4px solid var(--md-surface-container-lowest, #ffffff);
  box-shadow: none !important;
  filter: none !important;
  position: relative;
  box-sizing: border-box;
}

.neby-avatar-hero .neby-avatar-svg {
  filter: none !important;
}

.neby-avatar-hero:hover .neby-avatar-svg {
  transform: scale(1.08) translateY(-2px);
  filter: none !important;
}

/* Profile Mood Action Pills */
.neby-mood-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  margin-top: 14px;
  margin-bottom: 24px;
  padding: 8px 12px;
  background: rgba(37, 99, 235, 0.05);
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 14px;
  max-width: 100%;
}

.neby-mood-bar::-webkit-scrollbar {
  display: none;
}

.neby-mood-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--md-primary, #2563eb);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.neby-mood-pill {
  border: 1px solid rgba(37, 99, 235, 0.2);
  background: rgba(255, 255, 255, 0.85);
  color: var(--md-on-surface, #1e293b);
  border-radius: 20px;
  padding: 5px 12px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.18s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  user-select: none;
}

.neby-mood-pill:hover {
  background: var(--md-primary, #2563eb);
  color: #ffffff;
  transform: translateY(-1px);
  box-shadow: none;
  border-color: var(--md-primary, #2563eb);
}

.neby-mood-pill:active {
  transform: scale(0.95);
}

/* Dark mode compatibility */
[data-theme='dark'] .neby-avatar-mini {
  background: var(--md-surface-container-high, #1e293b);
  border-color: var(--md-outline-variant, #334155);
}

[data-theme='dark'] .neby-avatar-hero {
  background: var(--md-surface-container-lowest, #0f172a);
  border-color: var(--md-surface-container-lowest, #0f172a);
}

[data-theme='dark'] .neby-mood-bar {
  background: rgba(37, 99, 235, 0.1);
  border-color: rgba(37, 99, 235, 0.25);
}

[data-theme='dark'] .neby-mood-pill {
  background: rgba(30, 41, 59, 0.9);
  color: #f1f5f9;
  border-color: rgba(148, 163, 184, 0.2);
}

[data-theme='dark'] .neby-mood-pill:hover {
  background: #3b82f6;
  color: #ffffff;
}
`

// Output paths in NEB
const nebJsPath = path.join(nebRoot, 'backend_python/web/static/web/js/neby-avatar.js')
const nebCssPath = path.join(nebRoot, 'backend_python/web/static/web/css/neby-avatar.css')

// Ensure directories exist
await mkdir(path.dirname(nebJsPath), { recursive: true })
await mkdir(path.dirname(nebCssPath), { recursive: true })

await writeFile(nebJsPath, runtimeCode)
await writeFile(nebCssPath, cssCode)

console.log('✓ Successfully generated Neby interactive bundle:')
console.log('  ->', nebJsPath)
console.log('  ->', nebCssPath)
