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
var ExtendedQuantstampSale = artifacts.require("./ExtendedQuantstampSale.sol");

var abi = require('ethereumjs-abi');


module.exports = function(deployer, network, accounts) {
    //console.log("Accounts: " + accounts);
    deployer.deploy(QuantstampToken);
    deployer.link(QuantstampToken, StandardToken);
    deployer.link(QuantstampToken, Ownable);
    deployer.link(QuantstampToken, BurnableToken);
    deployer.link(QuantstampToken, SafeMath);

    var startTime = "";
    var admin = "";
    var beneficiary = "";
    var durationInMinutes = "";
    var capInEther = "";
    var minContributionInWei = "";

    if(network == "ropsten") {
        admin = "0x3d011185A327DbF81b65cB5502Ab33D02dee95F0";
        beneficiary = "0x26f77bD64d3CE2891906acB27d7ba09feB0C085b";
        durationInMinutes = 1440; // 1 day
        startTime = Math.round(new Date().getTime() / 1000);
        capInEther = 20;
        minContributionInWei = 1;
    }
    else { // "localhost" or "coverage"
        admin = accounts[1];
        beneficiary = accounts[1];
        previousContract = accounts[9];
        durationInMinutes = 5;
        startTime = Math.round(new Date().getTime() / 1000);
        capInEther = 20;
        minContributionInWei = 1;
    }

    console.log("Admin: " + admin);
    console.log("Beneficiary: " + beneficiary);
    console.log(startTime);

    var abi_constructor_args_for_token = abi.rawEncode([ "address"],
        [admin]).toString('hex');
    console.log("------------------------------------------");
    console.log("Use the following line for the QuantstampToken constructor arguments on etherscan:");
    console.log(abi_constructor_args_for_token);
    console.log("------------------------------------------");

    //used to be accounts[1] for both token and sale
    deployer.deploy(QuantstampToken, admin).then(function() {
        var abi_constructor_args_for_sale = abi.rawEncode([ "address", "uint", "uint", "uint", "uint", ],
        [ beneficiary, capInEther, minContributionInWei, startTime, durationInMinutes]).toString('hex');
        console.log("------------------------------------------");
        console.log("Use the following line for the QuantstampSale constructor arguments on etherscan:");
        console.log(abi_constructor_args_for_sale);
        console.log("------------------------------------------");

        return deployer.deploy(QuantstampSale, beneficiary, capInEther, minContributionInWei, startTime, durationInMinutes).then(function () {
            var abi_constructor_args_for_extendedSale = abi.rawEncode([ "address", "uint", "uint", "uint", "uint", "address" ],
            [ beneficiary, capInEther, minContributionInWei, startTime, durationInMinutes, QuantstampSale.address]).toString('hex');
            console.log("------------------------------------------");
            console.log("Use the following line for the ExtendedQuantstampSale constructor arguments on etherscan:");
            console.log(abi_constructor_args_for_extendedSale);
            console.log("------------------------------------------");

            return deployer.deploy(ExtendedQuantstampSale, beneficiary, capInEther, minContributionInWei, startTime, durationInMinutes, QuantstampSale.address);
        });
    });



};
