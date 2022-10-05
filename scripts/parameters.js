module.exports = {
  // MainPool
  // conf

  // 2 months initially, going down to 4 in 2 months
  minimumLockupTime: 7 * 8,
  earlyUnstakePenalty: 4000,
  maximumLockupTime: 365,

  // SidePool
  // conf
  rewardsFactor: 17000,
  stakeFactor: 640,

  // initial. In 1 month it will be reduced to 690
  swapFactor: 1380,

  decayInterval: 604800,
  decayFactor: 9900,
  taxPoints: 800,
  burnRatio: 7500,

  // initially, after will be decreased to 14
  coolDownDays: 30,

  sPSynrEquivalent: 180000,
  sPBoostFactor: 20000,
  sPBoostLimit: 360000,
  bPSynrEquivalent: 10000,
  bPBoostFactor: 20000,
  bPBoostLimit: 20000,
};
