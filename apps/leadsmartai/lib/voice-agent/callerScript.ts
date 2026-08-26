/**
 * What script did the CALLER actually speak in?
 *
 * The model is asked for the language the caller mainly spoke and still gets it
 * wrong — a call conducted almost entirely in Chinese came back "en", which then
 * became the preference on file and made the next call open in English. The
 * receptionist's own turns are the trap: she mirrors the caller, so a transcript
 * read as a whole is half agent text, and an English greeting plus an English
 * sign-off can outweigh the caller.
 *
 * So look only at the caller's lines, and only at script, which is unambiguous
 * where wording is not. Returns "" when there is too little to be sure — a short
 * or mixed call should leave the preference alone rather than guess at it.
 */
export function callerSpokenScript(transcript: string): "zh" | "en" | "" {
  const said = (transcript || "")
    .split("\n")
    .filter((l) => /^\s*(user|caller)\s*:/i.test(l))
    .join(" ");
  const han = (said.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (said.match(/[A-Za-z]/g) || []).length;
  // Words, not letters, for English: a Han character is a whole word, so the
  // two are not comparable by length. "Sorry, wrong number." is eighteen letters
  // and no evidence at all — counting letters let a wrong number overwrite a real
  // preference already on file.
  const words = (said.match(/[A-Za-z]+/g) || []).length;
  if (han >= 4 && han * 2 >= latin) return "zh";
  if (words >= 8 && han === 0) return "en";
  return ""; // too little, or genuinely mixed — leave what is on file alone
}
