/**
 * @typedef {Object} Prediction
 * @property {string} [champion]
 * @property {string} [runnerup]
 * @property {string} [thirdplace]
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
 * @property {string} type - 'champion' | 'runnerup' | 'thirdplace' | 'topscorer' | 'score'
 * @property {Prediction} prediction
 * @property {string} bet_text
 * @property {string} status - 'pending' | 'exact' | 'correct' | 'incorrect'
 * @property {number} points
 * @property {string | null} real_result
 * @property {boolean} verified
 * @property {boolean} manuallyEdited
 * @property {string} [realResult]
 * @property {{ homeTeam: string, awayTeam: string, homeScore: number|null, awayScore: number|null, date: string, distance: number } | null} [suggestedMatch]
 * @property {Match} [matchedMatch]
 */

/**
 * @typedef {Object} Match
 * @property {number} id
 * @property {string} date
 * @property {string} [time]
 * @property {string} [ground]
 * @property {string} homeTeam
 * @property {string} homeShort
 * @property {string} awayTeam
 * @property {string} awayShort
 * @property {number | null} homeScore
 * @property {number | null} awayScore
 * @property {string} resultString
 */

/**
 * @typedef {'W' | 'D' | 'L'} FormResult
 */

/**
 * @typedef {Object} TeamStats
 * @property {string} team
 * @property {number} played
 * @property {number} wins
 * @property {number} draws
 * @property {number} losses
 * @property {number} goalsFor
 * @property {number} goalsAgainst
 * @property {number} goalDifference
 * @property {number} points
 * @property {number} goalsForPerGame
 * @property {number} goalsAgainstPerGame
 * @property {FormResult[]} last5
 * @property {string[]} opponents
 */

/**
 * @typedef {Object} ParticipantAccuracy
 * @property {string} participant
 * @property {number} points
 * @property {number} resolved
 * @property {number} exact
 * @property {number} correct
 * @property {number} incorrect
 * @property {number} pending
 * @property {number} exactPct
 * @property {number} correctPct
 * @property {number} incorrectPct
 * @property {number} accuracyPct
 */

/**
 * @typedef {Object} SpecialPrediction
 * @property {string} value
 * @property {number} count
 * @property {number} pct
 */

/**
 * @typedef {Object} SpecialTallies
 * @property {SpecialPrediction[]} champion
 * @property {SpecialPrediction[]} runnerup
 * @property {SpecialPrediction[]} topscorer
 */

/**
 * @typedef {Object} FifaRankingEntry
 * @property {number} rank
 * @property {string} team
 * @property {number} points
 * @property {string} [confederation]
 * @property {number} [previousPoints]
 * @property {number} [change]
 */

/**
 * @typedef {Object} FifaRankings
 * @property {string | null} updated
 * @property {string} [source]
 * @property {FifaRankingEntry[]} rankings
 */

export {};
