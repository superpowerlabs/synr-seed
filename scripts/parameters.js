module.exports = {
  // MainPool
  // conf
  minimumLockupTime: 7 * 16,
  earlyUnstakePenalty: 4000,
  maximumLockupTime: 365,

  // SidePool
  // conf
  rewardsFactor: 17000,
  stakeFactor: 530,

  // initial. In 1 month it will be reduced to 690
  swapFactor: 1380,

  decayInterval: 604800,
  decayFactor: 9900,
  taxPoints: 800,
  burnRatio: 7000,

  // initially, after will be decreased to 14
  coolDownDays: 30,

  sPSynrEquivalent: 177000,
  sPBoostFactor: 20000,
  sPBoostLimit: 354000,
  bPSynrEquivalent: 11000,
  bPBoostFactor: 20000,
  bPBoostLimit: 22000,
};
