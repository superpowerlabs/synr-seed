module.exports = {
  // MainPool
  // conf
  minimumLockupTime: 7,
  earlyUnstakePenalty: 4000,

  // SidePool
  // conf
  rewardsFactor: 17000,
  stakeFactor: 530,
  swapFactor: 1380,
  decayInterval: 604800,
  decayFactor: 9900,
  taxPoints: 800,
  burnRatio: 7000,
  coolDownDays: 14,
  sPSynrEquivalent: 100000,
  // with the new calculation of boost
  sPBoostFactor: 20000,
  sPBoostLimit: 200000,
  bPSynrEquivalent: 3000,
  bPBoostFactor: 13220,
  bPBoostLimit: 6000,

  // initial values
  priceRatio: 10000,
};
