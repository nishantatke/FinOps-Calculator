function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function round2(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function pct(part, whole) {
  if (!whole) return 0;
  return round2((toNumber(part) / toNumber(whole)) * 100);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sum(values) {
  return round2((values || []).reduce((acc, v) => acc + toNumber(v), 0));
}

module.exports = {
  toNumber,
  round2,
  pct,
  clamp,
  sum,
};

