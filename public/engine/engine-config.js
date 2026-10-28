/* engine-config.js — KeyFinder's matcher tuning, moved out of its old app.js so the engine loads
 * on its own inside Homebase. match.js and vision.js read these as globals; load this first. */
const MATCH_THRESHOLD = 72;     // 0–100. A score at or above this counts as "same key".
const RATIO_TOLERANCE = 0.5;    // pre-filter: max relative difference in blade length/height ratio
const HEAD_SHAPE_PENALTY = 4;   // points subtracted when head-shape classes differ
const DTW_BAND = 8;             // shift tolerance, in samples (signature has SIG_N = 256)
const DTW_SCALE = 0.15;         // mean depth difference (fraction of blade height) that scores 0
const CUT_SCALE = 0.13;         // depth difference of the worst-matching cut that scores 0
const CUT_MIN_DEPTH = 0.06;     // a dip shallower than this isn't counted as a cut
const CUT_POS_TOLERANCE = 12;   // samples (~5% of blade length) two cuts may differ in position
const CLOSE_CALL_CUT = 0.035;   // above this, a match is flagged and the differing cut highlighted
const POSSIBLE_THRESHOLD = 55;  // between this and MATCH_THRESHOLD: "possible match", ask the user
const SINGLE_PHOTO_HANDICAP = 5;// points a single saved photo gives up against the key's combined template
