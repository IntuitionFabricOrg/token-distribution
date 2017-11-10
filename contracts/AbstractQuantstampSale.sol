// Quantstamp Technologies Inc. (info@quantstamp.com)

pragma solidity ^0.4.15;

/**
 * The QuantstampSale smart contract is used for migrating data from the
 * deployed pre-sale contract.
 */
contract AbstractQuantstampSale {
    // initially the sale is closed
    bool public saleClosed = false;
    // Stores the amount contributed for each tier for a given address
    mapping(address => uint256) public contributed1;
    mapping(address => uint256) public contributed2;
    mapping(address => uint256) public contributed3;
    mapping(address => uint256) public contributed4;
    // A map that tracks the amount of wei contributed by address
    mapping(address => uint256) public balanceOf;
    // A map that tracks the amount of QSP tokens that should be allocated to each address
    mapping(address => uint256) public tokenBalanceOf;
}