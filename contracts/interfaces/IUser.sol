interface IUser {
  event DepositSaved(address indexed user, uint16 indexed mainIndex);

  event DepositUnlocked(address indexed user, uint16 indexed mainIndex);

  struct Deposit {
    // @dev token type (0: sSYNR, 1: SYNR, 2: SYNR Pass)
    uint8 tokenType;
    // @dev locking period - from
    uint32 lockedFrom;
    // @dev locking period - until
    uint32 lockedUntil;
    // @dev token amount staked
    // SYNR maxTokenSupply is 10 billion * 18 decimals = 1e28
    // which is less type(uint96).max (~79e28)
    uint96 tokenAmountOrID;
    uint32 unlockedAt;
    // @dev mainIndex Since the process is asyncronous, the same deposit can be at a different index
    // on the main net and on the sidechain. This guarantees alignment
    uint16 mainIndex;
    // @dev pool token amount staked
    uint128 tokenAmount; //
    // @dev rewards ratio when staked
    uint32 rewardsFactor;
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total passes staked
    uint16 passAmount;
    // @dev Total blueprints staked
    uint16 blueprintAmount;
    // @dev Total staked amount
    uint128 stakedAmount;
    // @dev Total seed amount
    uint128 tokenAmount;
    // @dev when claimed rewards last time
    uint32 lastRewardsAt;
    Deposit[] deposits;
    // @dev reserved for future custom tokens
    mapping(uint8 => uint16) extraNftAmounts;
  }
}
