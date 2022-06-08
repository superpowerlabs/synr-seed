# SYNR/SEED Swap Pool

A relayer to allow to stake SYNR on Ethereum and get SEED on BNB Chain.

## Overview

The SYNR, Mobland's governance token, lives on Ethereum mainnet. The Mobland game is multi-chain and lives on side chains.

The problem was how to manage side tokens on BNB since the two chain do not talk each other.

The solution uses the Wormhole protocol to send messages between the Ethereum mainnet and the side chains hosting the game.

A first instance of `Tesseract`, deployed on Ethereum, will initiate the stake of SYNR, sSYNR, and SYNR passes, starting the Wormhole transfer process. A second instance, deployed on the side chains, will complete the info transfer, acknowledge the parameter received and set the side tokens in a pool.

Tesseract, used here as a primary interface, supports multiple bridges. Also, pools can be managed by multiple bridges, if needed.

## The flow

1. The user connects wallet to Ethereum and Stake, for example, SYNR in the pool
2. The user waits for the encoded VM coming from Wormhole API
3. When the evm is ready, the user connects to the side-chain and complete the process to stake the side token

## Copyright

Author: Francesco Sullo <francesco@superpower.io>

(c) 2022 Superpower Labs Inc.
