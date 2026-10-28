/* engine-export.js — hands the engine's modules to Homebase. They are top-level consts in classic
 * scripts, which don't become window properties, so this script (loaded last) publishes them. */
window.__KeyEngine = { Vision, Matcher, Identify, OCR, SOURCE_LABEL, SOURCE_RANK, MATCH_THRESHOLD, POSSIBLE_THRESHOLD, CLOSE_CALL_CUT };
