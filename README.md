# iFab Token Launch

This document gives an overview of the smart contracts used for the iFab token launch.

# Overview

## iFab Token

The iFab token smart contract `IntuitionToken.sol` is ERC20-compatible and has the following additional characteristics:

1. A fixed supply of pre-minted tokens
2. The ability to burn tokens by a user, removing the tokens from the supply
3. During the token launch period, regular users cannot transfer tokens
4. A crowdlaunch is given an allowance of tokens to be sold on behalf of the token owner

At the completion of the final token launch, iFab plans to do the following:

1. Burn all unallocated tokens
2. Enable the ability to transfer tokens for everyone

Once these final two steps are performed, the distribution of tokens is complete.

### Implementation

We use OpenZeppelin code for `SafeMath`, `Ownable`, `Burnable` and `StandardToken` logic.

* `SafeMath` provides arithmetic functions that throw exceptions when integer overflow occurs
* `Ownable` keeps track of a contract owner and permits the transfer of ownership by the current owner
* `Burnable` provides a burn function that decrements the balance of the burner and the total supply
* `StandardToken` provides an implementation of the ERC20 standard

The token contract includes the following constants:

```javascript
    name             = "Intuition";
    symbol           = "AIG";  // artificial intuition genesis
    decimals         = 18;
    INITIAL_SUPPLY   = 10 billion AIG
    CROWDlaunch_SUPPLY = 4500 million AIG
```

The above constants indicate a total supply of 10 billion pre-minted tokens. The logic behind this is that there should be one token per person by the year 2045. Of those, 4.5 billion tokens are set aside as an allowance for token launch purposes.

## iFab launch

The iFab launch smart contract may be used to sell AIT tokens. To begin a token launch, the token owner must call the `setTokenLaunch()` function of the token contract, passing the address of the token launch and the requested allowance of tokens to be sold. Although ownership of the tokens is tied up in the token contract, the token launch is given an allowance of tokens from the token launch supply and thus is able to transfer tokens to users.

### Token launch



Copyright 2018 Artificial Intuition Limited. All Rights Reserved.
