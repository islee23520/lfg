// @bun
// vendor/omo-standalone/packages/ulw-intent/src/index.ts
var codeBlockPattern = /```[\s\S]*?```/g;
var inlineCodePattern = /`[^`]+`/g;
var ultraworkPattern = /\b(ultrawork|ulw)\b/i;
var hyperplanPattern = /\b(hyperplan|hpp)\b/i;
var hyperplanUltraworkPattern = /\b(?:hpp|hyperplan)\s+(?:ulw|ultrawork)\b|\b(?:ulw|ultrawork)\s+(?:hpp|hyperplan)\b/i;
function removeCode(text) {
  return text.replace(codeBlockPattern, "").replace(inlineCodePattern, "");
}
function detectUlwIntent(text) {
  const normalized = removeCode(text);
  const intents = [];
  if (hyperplanUltraworkPattern.test(normalized)) {
    intents.push({ type: "hyperplan-ultrawork", prompt: getUlwIntentPrompt("hyperplan-ultrawork") });
    return intents;
  }
  if (ultraworkPattern.test(normalized)) {
    intents.push({ type: "ultrawork", prompt: getUlwIntentPrompt("ultrawork") });
  }
  if (hyperplanPattern.test(normalized)) {
    intents.push({ type: "hyperplan", prompt: getUlwIntentPrompt("hyperplan") });
  }
  return intents;
}
function getUlwIntentPrompt(type) {
  if (type === "hyperplan-ultrawork")
    return "HYPERPLAN ULTRAWORK MODE ENABLED!";
  if (type === "hyperplan")
    return "HYPERPLAN MODE ENABLED!";
  return "ULTRAWORK MODE ENABLED!";
}
export {
  removeCode,
  getUlwIntentPrompt,
  detectUlwIntent
};
