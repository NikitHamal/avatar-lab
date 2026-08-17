export const proceduralBrowserRuntime = `
const SVG_NS = 'http://www.w3.org/2000/svg';
const avatarInstanceId = () => typeof globalThis.crypto?.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
const clamp01 = value => Math.max(0, Math.min(1, value));
const easeProgress = (progress, transition) => transition === 'smooth'
  ? progress * progress * (3 - 2 * progress)
  : transition === 'snappy'
    ? 1 - (1 - progress) ** 3
    : 1 - Math.exp(-6 * progress) * Math.cos(8 * progress);
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
  const value = color.replace('#', '');
  const hex = value.length === 3 ? value.split('').map(channel => channel + channel).join('') : value;
  const numeric = Number.parseInt(hex, 16);
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
};
const interpolateColor = (from, to, progress) => {
  const left = colorChannels(from);
  const right = colorChannels(to);
  const value = left.map((channel, index) => Math.round(channel + (right[index] - channel) * progress));
  return '#' + value.map(channel => channel.toString(16).padStart(2, '0')).join('');
};
const resolveColors = expression => ({
  body: expression.bodyColor || DATA.avatar.colors.body,
  eyes: expression.eyeColor || DATA.avatar.colors.eyes,
});
const EFFECT_COLORS = ['#ff4d8d', '#ffd166', '#38d9a9', '#5b8cff', '#a970ff', '#ff7a45'];
const EFFECT_TAU = Math.PI * 2;
const effectHash01 = seed => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};
const effectStarPath = (cx, cy, radius) => {
  const points = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = -Math.PI / 2 + (index / 8) * EFFECT_TAU;
    const r = index % 2 === 0 ? radius : radius * 0.34;
    points.push((cx + Math.cos(angle) * r).toFixed(2) + ',' + (cy + Math.sin(angle) * r).toFixed(2));
  }
  return 'M' + points.join(' L') + ' Z';
};
const effectHeartPath = (cx, cy, scale) =>
  'M' + cx + ' ' + (cy + 7 * scale) +
  ' C' + (cx - 18 * scale) + ' ' + (cy - 4 * scale) + ' ' + (cx - 12 * scale) + ' ' + (cy - 20 * scale) + ' ' + cx + ' ' + (cy - 10 * scale) +
  ' C' + (cx + 12 * scale) + ' ' + (cy - 20 * scale) + ' ' + (cx + 18 * scale) + ' ' + (cy - 4 * scale) + ' ' + cx + ' ' + (cy + 7 * scale) + 'Z';
const effectMarkup = (effect, elapsedMs) => {
  if (!effect || effect === 'none') return '';
  const time = elapsedMs / 1000;
  if (effect === 'confetti') {
    return Array.from({ length: 22 }, (_, index) => {
      const xBase = -138 + effectHash01(index + 1) * 276;
      const speed = 95 + effectHash01(index + 31) * 85;
      const y = ((-170 + speed * time + effectHash01(index + 71) * 260 + 180) % 350) - 180;
      const sway = Math.sin(time * (2.2 + effectHash01(index + 91) * 2.4) + index) * 10;
      const rotation = (time * (180 + effectHash01(index + 111) * 420) + index * 37) % 360;
      const width = 5 + effectHash01(index + 131) * 5;
      const height = 2.8 + effectHash01(index + 151) * 3;
      const x = xBase + sway;
      return '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + width.toFixed(2) + '" height="' + height.toFixed(2) + '" rx="1.5" fill="' + EFFECT_COLORS[index % EFFECT_COLORS.length] + '" opacity="0.94" transform="rotate(' + rotation.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ')"/>';
    }).join('');
  }
  if (effect === 'hearts') {
    return Array.from({ length: 7 }, (_, index) => {
      const duration = 1.9 + (index % 3) * 0.35;
      const progress = (time / duration + index * 0.17) % 1;
      const x = -88 + index * 29 + Math.sin(progress * EFFECT_TAU + index) * 8;
      const y = 112 - progress * 238;
      const opacity = Math.sin(progress * Math.PI) * 0.9;
      return '<path d="' + effectHeartPath(x, y, 0.58 + (index % 3) * 0.11) + '" fill="' + (index % 2 ? '#ff4d8d' : '#ff7aa8') + '" opacity="' + opacity.toFixed(3) + '"/>';
    }).join('');
  }
  if (effect === 'sparkles' || effect === 'introGlow') {
    const positions = [[-104,-78,10],[108,-55,8],[-118,45,7],[112,64,11],[78,-112,6]];
    const rings = effect === 'introGlow'
      ? '<circle cx="0" cy="0" r="' + (124 + Math.sin(time * 2.4) * 10).toFixed(2) + '" fill="none" stroke="#93c5fd" stroke-width="2" opacity="0.18"/><circle cx="0" cy="0" r="' + (136 + Math.cos(time * 1.9) * 8).toFixed(2) + '" fill="none" stroke="#60a5fa" stroke-width="1" opacity="0.12"/>'
      : '';
    return rings + positions.map((entry, index) => {
      const x = entry[0], y = entry[1], r = entry[2];
      const pulse = 0.72 + (Math.sin(time * (4 + index * 0.33) + index) + 1) * 0.22;
      return '<path d="' + effectStarPath(x, y, r * pulse) + '" fill="' + EFFECT_COLORS[(index + 1) % EFFECT_COLORS.length] + '" opacity="' + (0.45 + pulse * 0.45).toFixed(3) + '"/>';
    }).join('');
  }
  if (effect === 'alert') {
    const phase = (time % 0.9) / 0.9;
    return '<circle cx="0" cy="0" r="' + (112 + phase * 30).toFixed(2) + '" fill="none" stroke="#ffd166" stroke-width="4" opacity="' + (0.55 * (1 - phase)).toFixed(3) + '"/><path d="M0 -140 L-8 -122 L8 -122 Z" fill="#ffd166" opacity="' + (0.55 + Math.sin(time * 8.5) * 0.35).toFixed(3) + '"/>';
  }
  if (effect === 'successBurst') {
    return Array.from({ length: 12 }, (_, index) => {
      const angle = (index / 12) * EFFECT_TAU;
      const pulse = 0.45 + (Math.sin(time * 6.4 - index * 0.2) + 1) * 0.25;
      return '<line x1="' + (Math.cos(angle) * 112).toFixed(2) + '" y1="' + (Math.sin(angle) * 112).toFixed(2) + '" x2="' + (Math.cos(angle) * 137).toFixed(2) + '" y2="' + (Math.sin(angle) * 137).toFixed(2) + '" stroke="' + EFFECT_COLORS[index % EFFECT_COLORS.length] + '" stroke-width="4" stroke-linecap="round" opacity="' + pulse.toFixed(3) + '"/>';
    }).join('');
  }
  if (effect === 'errorPulse') {
    const phase = (time % 0.56) / 0.56;
    return '<circle cx="0" cy="0" r="' + (116 + phase * 22).toFixed(2) + '" fill="none" stroke="#ff5f6d" stroke-width="4" opacity="' + (0.72 * Math.sin(phase * Math.PI)).toFixed(3) + '"/>';
  }
  if (effect === 'zzz' || effect === 'question') {
    const glyph = effect === 'zzz' ? 'Z' : '?';
    return [0,1,2].map(index => '<text x="' + (76 + index * 20) + '" y="' + (-78 - index * 22) + '" font-size="' + (18 + index * 5) + '" font-weight="700" text-anchor="middle" fill="#64748b" opacity="' + (0.45 + Math.sin(time * (2.2 + index * 0.2) + index) * 0.25).toFixed(3) + '">' + glyph + '</text>').join('');
  }
  return '';
};
const svgElement = name => document.createElementNS(SVG_NS, name);

function mountAvatar(target, options = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('Avatar target was not found.');
  const animationNames = Object.keys(DATA.animations);
  if (!animationNames.length) throw new Error('The avatar export contains no animations.');
  const instanceId = avatarInstanceId();
  const clipId = 'avatar-procedural-clip-' + instanceId;
  const svg = svgElement('svg');
  svg.setAttribute('viewBox', '-150 -150 300 300');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', DATA.avatar.name);
  svg.style.width = typeof options.size === 'number' ? options.size + 'px' : options.size || '100%';
  svg.style.height = typeof options.size === 'number' ? options.size + 'px' : options.size || '100%';
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  const defs = svgElement('defs');
  const clipPath = svgElement('clipPath');
  const clipHead = svgElement('path');
  clipPath.id = clipId;
  clipPath.append(clipHead);
  defs.append(clipPath);
  svg.append(defs);
  const motionLayer = svgElement('g');
  const backLayer = svgElement('g');
  const head = svgElement('path');
  const eyesLayer = svgElement('g');
  const leftEye = svgElement('path');
  const rightEye = svgElement('path');
  const mouth = svgElement('path');
  const frontLayer = svgElement('g');
  const effectLayer = svgElement('g');
  eyesLayer.setAttribute('clip-path', 'url(#' + clipId + ')');
  mouth.setAttribute('fill', 'none');
  mouth.setAttribute('stroke-linecap', 'round');
  mouth.setAttribute('stroke-linejoin', 'round');
  eyesLayer.append(leftEye, rightEye, mouth);
  motionLayer.append(backLayer, head, eyesLayer, frontLayer);
  effectLayer.setAttribute('pointer-events', 'none');
  effectLayer.setAttribute('aria-hidden', 'true');
  svg.append(motionLayer, effectLayer);
  host.replaceChildren(svg);

  const ensurePaths = (group, paths, fill) => {
    while (group.children.length < paths.length) group.append(svgElement('path'));
    while (group.children.length > paths.length) group.lastElementChild.remove();
    paths.forEach((path, index) => {
      group.children[index].setAttribute('d', path);
      group.children[index].setAttribute('fill', fill);
    });
  };
  let currentAnimation = options.animation && DATA.animations[options.animation] ? options.animation : animationNames[0];
  const initialStep = DATA.animations[currentAnimation].steps[0];
  const initialExpression = DATA.expressions[initialStep.expressionId];
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
  let playing = false;
  let paused = false;
  let pausedRemainingMs = 0;
  let pausedTransition = null;
  let pausedBlink = null;
  let pausedBlinkDelay = 0;
  let stepDueAt = null;
  let eyeAmbientStartedAt = performance.now();
  let bodyAmbientStartedAt = performance.now();
  let eyeAmbientSignature = initialExpression.eyeMotion;
  let bodyAmbientSignature = initialExpression.bodyMotion;
  let ambientStrength = 1;
  let lastAmbientFrame = 0;

  const applyMotion = expression => {
    const now = performance.now();
    if (expression.eyeMotion !== eyeAmbientSignature) {
      eyeAmbientSignature = expression.eyeMotion;
      eyeAmbientStartedAt = now;
    }
    if (expression.bodyMotion !== bodyAmbientSignature) {
      bodyAmbientSignature = expression.bodyMotion;
      bodyAmbientStartedAt = now;
    }
  };
  const render = (time = performance.now()) => {
    const eyeElapsed = time - eyeAmbientStartedAt;
    const bodyElapsed = time - bodyAmbientStartedAt;
    const expression = AvatarProceduralEngine.hasAmbientMotion(currentPose.expression)
      ? AvatarProceduralEngine.applyAmbientBodyMotion(currentPose.expression, Math.max(eyeElapsed, bodyElapsed), ambientStrength)
      : currentPose.expression;
    const eyeOffset = AvatarProceduralEngine.ambientEyeOffset(currentPose.expression, eyeElapsed, ambientStrength);
    const renderedPose = AvatarProceduralEngine.poseFromExpression(expression);
    const geometry = AvatarProceduralEngine.renderAvatar(renderedPose, DATA.avatar.surface, blinkAmount, {
      includeWire: false,
      bodyNodes: DATA.avatar.bodyNodes,
      eyeOffset,
    });
    const offset = AvatarProceduralEngine.ambientBodyOffset(currentPose.expression, bodyElapsed, ambientStrength);
    motionLayer.setAttribute('transform', 'translate(' + offset.x + ' ' + offset.y + ')');
    ensurePaths(backLayer, geometry.backPaths, currentColors.body);
    ensurePaths(frontLayer, geometry.frontPaths, currentColors.body);
    head.setAttribute('d', geometry.headPath);
    head.setAttribute('fill', currentColors.body);
    clipHead.setAttribute('d', geometry.headPath);
    leftEye.setAttribute('d', geometry.leftPath);
    rightEye.setAttribute('d', geometry.rightPath);
    leftEye.setAttribute('fill', currentColors.eyes);
    rightEye.setAttribute('fill', currentColors.eyes);
    leftEye.style.display = geometry.leftVisible ? '' : 'none';
    rightEye.style.display = geometry.rightVisible ? '' : 'none';
    const mouthVisible = DATA.avatar.mouthEnabled === true && geometry.mouthVisible && geometry.mouthPath;
    mouth.setAttribute('d', mouthVisible ? geometry.mouthPath : '');
    mouth.setAttribute('stroke', currentColors.eyes);
    mouth.setAttribute('stroke-width', String(expression.mouthStrokeWidth || 3.2));
    mouth.style.display = mouthVisible ? '' : 'none';
    effectLayer.innerHTML = effectMarkup(expression.effect, time);
  };
  const tick = time => {
    frameRequest = null;
    if (transitionState) {
      const linear = clamp01((time - transitionState.startedAt) / transitionState.durationMs);
      const eased = easeProgress(linear, transitionState.transition);
      ambientStrength = clamp01(eased);
      const expression = { ...transitionState.fromPose.expression };
      AvatarProceduralEngine.expressionFields.forEach(field => {
        expression[field] = transitionState.fromPose.expression[field] +
          (transitionState.toPose.expression[field] - transitionState.fromPose.expression[field]) * eased;
      });
      expression.eyeMotion = transitionState.toPose.expression.eyeMotion;
      expression.bodyMotion = transitionState.toPose.expression.bodyMotion;
      expression.eyeStyle = eased >= 0.5
        ? (transitionState.toPose.expression.eyeStyle || transitionState.fromPose.expression.eyeStyle)
        : (transitionState.fromPose.expression.eyeStyle || transitionState.toPose.expression.eyeStyle);
      expression.mouth = eased >= 0.5
        ? (transitionState.toPose.expression.mouth || transitionState.fromPose.expression.mouth || 'none')
        : (transitionState.fromPose.expression.mouth || transitionState.toPose.expression.mouth || 'none');
      expression.effect = eased >= 0.16
        ? (transitionState.toPose.expression.effect || 'none')
        : (transitionState.fromPose.expression.effect || 'none');
      const mouthDefaults = { mouthScale: 1, mouthOffsetX: 0, mouthOffsetY: 0, mouthWidth: 1, mouthCurve: 1, mouthStrokeWidth: 3.2 };
      Object.keys(mouthDefaults).forEach(field => {
        const fromValue = transitionState.fromPose.expression[field] ?? mouthDefaults[field];
        const toValue = transitionState.toPose.expression[field] ?? mouthDefaults[field];
        expression[field] = fromValue + (toValue - fromValue) * eased;
      });
      currentPose = AvatarProceduralEngine.poseFromExpression(expression);
      currentColors = {
        body: interpolateColor(transitionState.fromColors.body, transitionState.toColors.body, clamp01(eased)),
        eyes: interpolateColor(transitionState.fromColors.eyes, transitionState.toColors.eyes, clamp01(eased)),
      };
      if (linear >= 1) {
        currentPose = transitionState.toPose;
        currentColors = transitionState.toColors;
        transitionState = null;
        ambientStrength = 1;
      }
    }
    if (blinkState) {
      const progress = clamp01((time - blinkState.startedAt) / blinkState.durationMs);
      if (progress <= 0.42) {
        const closeProgress = progress / 0.42;
        blinkAmount = 1 - closeProgress * closeProgress;
      } else {
        const openProgress = (progress - 0.42) / 0.58;
        blinkAmount = 1 - (1 - openProgress) ** 2;
      }
      if (progress >= 1) {
        blinkAmount = 1;
        blinkState = null;
      }
    }
    const ambientActive = AvatarProceduralEngine.hasAmbientMotion(currentPose.expression) ||
      (currentPose.expression.effect && currentPose.expression.effect !== 'none');
    if (transitionState || blinkState || !ambientActive || time - lastAmbientFrame >= 1000 / 30) {
      render(time);
      if (ambientActive) lastAmbientFrame = time;
    }
    if (transitionState || blinkState || ambientActive) frameRequest = requestAnimationFrame(tick);
  };
  const requestTick = () => {
    if (frameRequest === null) frameRequest = requestAnimationFrame(tick);
  };
  const animateTo = (expressionId, durationMs, transition) => {
    const target = DATA.expressions[expressionId];
    if (!target) return;
    applyMotion(target);
    const resolved = resolvedTargetExpression(target, currentPose.expression);
    const targetPose = AvatarProceduralEngine.poseFromExpression(resolved);
    const targetColors = resolveColors(target);
    if (durationMs <= 0) {
      ambientStrength = 1;
      transitionState = null;
      currentPose = targetPose;
      currentColors = targetColors;
      render();
      if (AvatarProceduralEngine.hasAmbientMotion(currentPose.expression)) requestTick();
      return;
    }
    transitionState = {
      fromPose: currentPose,
      toPose: targetPose,
      fromColors: currentColors,
      toColors: targetColors,
      startedAt: performance.now(),
      durationMs,
      transition,
      expressionId,
    };
    ambientStrength = 0;
    requestTick();
  };
  const clearSchedule = () => {
    if (stepTimer !== null) clearTimeout(stepTimer);
    if (blinkTimer !== null) clearTimeout(blinkTimer);
    stepTimer = null;
    blinkTimer = null;
    blinkDueAt = null;
    stepDueAt = null;
  };
  const scheduleBlink = (animation, delay) => {
    if (!animation.blink.enabled) return;
    blinkDueAt = performance.now() + delay;
    blinkTimer = setTimeout(() => {
      blinkDueAt = null;
      blinkState = { startedAt: performance.now(), durationMs: animation.blink.durationMs };
      requestTick();
      const range = animation.blink.maxIntervalMs - animation.blink.minIntervalMs;
      scheduleBlink(animation, animation.blink.durationMs + animation.blink.minIntervalMs + Math.random() * range);
    }, delay);
  };
  const advance = animation => {
    const last = animation.steps.length - 1;
    const playbackMode = options.loop === true ? 'loop' : options.loop === false ? 'once' : animation.playbackMode;
    if (playbackMode === 'once' && stepIndex >= last) {
      playing = false;
      options.onAnimationEnd?.(currentAnimation);
      return;
    }
    if (playbackMode === 'pingPong' && last > 0) {
      if (stepIndex >= last) direction = -1;
      else if (stepIndex <= 0) direction = 1;
      stepIndex += direction;
    } else stepIndex = (stepIndex + 1) % (last + 1);
    runStep(animation);
  };
  const runStep = animation => {
    if (!playing || !animation.steps.length) return;
    const step = animation.steps[stepIndex];
    animateTo(step.expressionId, step.transitionMs, step.transition);
    const duration = step.transitionMs + step.holdMs;
    stepDueAt = performance.now() + duration;
    stepTimer = setTimeout(() => advance(animation), duration);
  };
  const api = {
    element: svg,
    get animation() { return currentAnimation; },
    get playing() { return playing; },
    play(animationName) {
      animationName = animationName || currentAnimation;
      if (!DATA.animations[animationName]) throw new Error('Unknown animation: ' + animationName);
      clearSchedule();
      if (animationName === currentAnimation && paused) {
        paused = false;
        playing = true;
        if (pausedTransition) animateTo(pausedTransition.expressionId, pausedTransition.durationMs, pausedTransition.transition);
        if (pausedBlink) {
          blinkState = {
            startedAt: performance.now() - pausedBlink.progress * pausedBlink.durationMs,
            durationMs: pausedBlink.durationMs,
          };
          requestTick();
        }
        stepDueAt = performance.now() + pausedRemainingMs;
        stepTimer = setTimeout(() => advance(DATA.animations[currentAnimation]), pausedRemainingMs);
        scheduleBlink(
          DATA.animations[currentAnimation],
          pausedBlinkDelay || DATA.animations[currentAnimation].blink.minIntervalMs
        );
        pausedTransition = null;
        pausedBlink = null;
        pausedBlinkDelay = 0;
        return api;
      }
      currentAnimation = animationName;
      stepIndex = 0;
      direction = 1;
      paused = false;
      playing = true;
      runStep(DATA.animations[currentAnimation]);
      scheduleBlink(DATA.animations[currentAnimation], DATA.animations[currentAnimation].blink.initialDelayMs);
      return api;
    },
    pause() {
      const now = performance.now();
      if (playing && stepDueAt !== null) pausedRemainingMs = Math.max(stepDueAt - now, 0);
      pausedBlinkDelay = blinkDueAt === null ? 0 : Math.max(blinkDueAt - now, 0);
      if (transitionState) {
        const elapsed = now - transitionState.startedAt;
        pausedTransition = {
          expressionId: transitionState.expressionId,
          durationMs: Math.max(transitionState.durationMs - elapsed, 0),
          transition: transitionState.transition,
        };
      }
      if (blinkState) {
        pausedBlink = {
          progress: clamp01((now - blinkState.startedAt) / blinkState.durationMs),
          durationMs: blinkState.durationMs,
        };
      }
      clearSchedule();
      transitionState = null;
      blinkState = null;
      paused = true;
      playing = false;
      render();
      return api;
    },
    stop() {
      clearSchedule();
      transitionState = null;
      blinkState = null;
      blinkAmount = 1;
      pausedBlink = null;
      pausedBlinkDelay = 0;
      paused = false;
      playing = false;
      stepIndex = 0;
      direction = 1;
      const first = DATA.animations[currentAnimation].steps[0];
      if (first) animateTo(first.expressionId, 0, first.transition);
      return api;
    },
    destroy() {
      clearSchedule();
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      svg.remove();
    },
  };
  applyMotion(initialExpression);
  render();
  if (AvatarProceduralEngine.hasAmbientMotion(initialExpression)) requestTick();
  if (options.autoplay !== false) api.play(currentAnimation);
  return api;
}
`
