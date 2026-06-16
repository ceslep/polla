/**
 * @typedef {Object} Prediction
 * @property {string} [champion]
 * @property {string} [runnerup]
 * @property {string} [topscorer]
 * @property {string} [homeTeam]
 * @property {string} [awayTeam]
 * @property {number} [homeScore]
 * @property {number} [awayScore]
 */

/**
 * @typedef {Object} Bet
 * @property {string} id
 * @property {string} messageId
 * @property {string} timestamp
 * @property {string} participant
 * @property {string} phone
 * @property {string} originalMessage
 * @property {string} type - 'champion' | 'runnerup' | 'topscorer' | 'score'
 * @property {Prediction} prediction
 * @property {string} bet_text
 * @property {string} status - 'pending' | 'exact' | 'correct' | 'incorrect'
 * @property {number} points
 * @property {string | null} real_result
 * @property {boolean} verified
 * @property {boolean} manuallyEdited
 * @property {string} [realResult]
 */

/**
 * @typedef {Object} Match
 * @property {number} id
 * @property {string} date
 * @property {string} homeTeam
 * @property {string} homeShort
 * @property {string} awayTeam
 * @property {string} awayShort
 * @property {number} homeScore
 * @property {number} awayScore
 * @property {string} resultString
 */

export {};
