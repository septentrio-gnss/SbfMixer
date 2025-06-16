// GPS Time Constants
const GPS_EPOCH_MS = new Date('1980-01-06T00:00:00Z').getTime();
const MS_IN_WEEK = 604800 * 1000; // 7 * 24 * 60 * 60 * 1000
const MS_IN_YEAR = 31536000 * 1000; // 365 * 24 * 60 * 60 * 1000

/**
 * Converts GPS Week Number (WNc) and Time Of Week (TOW) in milliseconds to
 * milliseconds since the GPS epoch (1980-01-06).
 * @param {number} WNc - GPS Week Number.
 * @param {number} TOW - GPS Time Of Week in milliseconds.
 * @returns {number} Milliseconds since GPS epoch.
 */
function TowToMs(WNc, TOW) {
    return WNc * MS_IN_WEEK + TOW;
}

function msgToMs(msg, defaultTime){
    if(msg.block && msg.block.WNc && msg.block.TOW){
        return TowToMs(msg.block.WNc, msg.block.TOW);
    }
    return defaultTime;
}

/**
 * Converts milliseconds since the GPS epoch (1980-01-06) to
 * GPS Week Number (WNc) and Time Of Week (TOW) in milliseconds.
 * @param {number} timeMessageMs - Milliseconds since GPS epoch.
 * @returns {{WNc: number, TOW: number}} An object containing WNc and TOW.
 */
function msToTow(timeMessageMs) {
    const msSinceGpsEpoch = timeMessageMs - GPS_EPOCH_MS;
    const WNc = Math.floor(msSinceGpsEpoch / MS_IN_WEEK);
    const TOW = msSinceGpsEpoch % MS_IN_WEEK;
    return { WNc, TOW };
}

module.exports = {
    TowToMs,
    msgToMs,
    msToTow,
    GPS_EPOCH_MS,
    MS_IN_WEEK,
    MS_IN_YEAR
};