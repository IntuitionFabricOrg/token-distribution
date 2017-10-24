var QuantstampSale = artifacts.require("./QuantstampSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");

var bigInt = require("big-integer");


async function logUserBalances (token, accounts) {
 console.log("");
 console.log("User Balances:");
 console.log("--------------");
 console.log(`Owner: ${(await token.balanceOf(accounts[0])).toNumber()}`);
 console.log(`User1: ${(await token.balanceOf(accounts[1])).toNumber()}`);
 console.log(`User2: ${(await token.balanceOf(accounts[2])).toNumber()}`);
 console.log(`User3: ${(await token.balanceOf(accounts[3])).toNumber()}`);
 console.log(`User4: ${(await token.balanceOf(accounts[4])).toNumber()}`);

 console.log("--------------")
 console.log("")
}

async function logEthBalances (token, sale, accounts) {
 console.log("");
 console.log("Eth Balances:");
 console.log("-------------");
 console.log(`Owner: ${(await web3.eth.getBalance(accounts[0])).toNumber()}`);
 console.log(`User1: ${(await web3.eth.getBalance(accounts[1])).toNumber()}`);
 console.log(`User2: ${(await web3.eth.getBalance(accounts[2])).toNumber()}`);
 console.log(`User3: ${(await web3.eth.getBalance(accounts[3])).toNumber()}`);
 console.log(`User4: ${(await web3.eth.getBalance(accounts[4])).toNumber()}`);
 console.log(`Sale : ${(await web3.eth.getBalance(sale.address)).toNumber()}`);
 console.log(`Token: ${(await web3.eth.getBalance(token.address)).toNumber()}`);


 console.log("--------------")
 console.log("")
}

contract('Whitelist Crowdsale', function(accounts) {
  // account[0] points to the owner on the testRPC setup
  var owner = accounts[0];
  var beneficiary = accounts[1];
  var user2 = accounts[2];
  var user3 = accounts[3];
  var user4 = accounts[4];

  var sale2;

  beforeEach(function() {
    return QuantstampSale.deployed().then(function(instance) {
        sale = instance;
        return QuantstampToken.deployed();
    }).then(function(instance2){
      token = instance2;
      return token.INITIAL_SUPPLY();
    }).then(function(val){
      initialSupply = val.toNumber();
      return token.owner();
    }).then(function(owner){
      tokenOwner = owner;
      return token.CROWDSALE_ALLOWANCE();
    }).then(function(val){
      crowdsaleSupply = val.toNumber();
    });
  });

    it("should add user2 to the whitelist", async function() {
        // 0 indicates all crowdsale tokens
        await token.setCrowdsale(sale.address, 0); // ensures crowdsale has allowance of tokens

        var amountEther = 2;
        var amountWei = web3.toWei(amountEther, "ether");

        var r = await sale.changeRegistrationStatus(user2, true, amountWei, 5000, 0, {from:owner});

        assert.equal(r.logs[0].event, 'RegistrationStatusChanged', "event is wrong");
		assert.equal(r.logs[0].args.target, user2, "target is wrong");
		assert.equal(r.logs[0].args.isRegistered, true, "isRegistered is wrong");

		var r = await sale.changeRegistrationStatus(user2, false, 0, 0, 0,{from:owner});
		assert.equal(r.logs[0].event, 'RegistrationStatusChanged', "event is wrong");
		assert.equal(r.logs[0].args.target, user2, "target is wrong");
		assert.equal(r.logs[0].args.isRegistered, false, "isRegistered is wrong");
    });

});
