var SafeMath = artifacts.require("./math/SafeMath.sol");
var ERC20 = artifacts.require("./token/ERC20.sol");
var ERC20Basic = artifacts.require("./token/ERC20Basic.sol");
var BurnableToken = artifacts.require("./token/BurnableToken.sol");
var BasicToken = artifacts.require("./token/BasicToken.sol");
var StandardToken = artifacts.require("./token/StandardToken.sol");
var Ownable = artifacts.require("./ownership/Ownable.sol");
var Pausable = artifacts.require("./lifecycle/Pausable.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var QuantstampSale = artifacts.require("./QuantstampSale.sol");


module.exports = function(deployer, network, accounts) {
    //console.log("Accounts: " + accounts);
    deployer.deploy(QuantstampToken);
    deployer.link(QuantstampToken, StandardToken);
    deployer.link(QuantstampToken, Ownable);
    deployer.link(QuantstampToken, BurnableToken);
    deployer.link(QuantstampToken, SafeMath);

    var time = new Date().getTime() / 1000;
    var admin = "";
    var beneficiary = "";
    console.log("TIME: " + time);
    if (network == "localhost") {
        admin = accounts[1];
        beneficiary = accounts[1];
    } else if(network == "ropsten") {
        admin = "0x3d011185A327DbF81b65cB5502Ab33D02dee95F0";
        beneficiary = "0x26f77bD64d3CE2891906acB27d7ba09feB0C085b";
    }
    console.log("Admin: " + admin);
    console.log("Beneficiary: " + beneficiary);

    //used to be accounts[1] for both token and sale
    deployer.deploy(QuantstampToken, admin).then(function() {
        return deployer.deploy(QuantstampSale, beneficiary, 20, 1, time, 2, QuantstampToken.address);
    });



};
