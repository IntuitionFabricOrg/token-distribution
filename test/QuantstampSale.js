
var QuantstampSale = artifacts.require("./QuantstampSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var util = require("./util.js");

contract('QuantstampSale constructor', function(accounts) {
  // account[0] points to the owner on the testRPC setup
  var owner = accounts[0];
  var user1 = accounts[1];
  var user2 = accounts[2];
  var user3 = accounts[3];

  beforeEach(function() {
    return QuantstampSale.deployed().then(function(instance) {
        sale = instance;
        return QuantstampToken.deployed();
    }).then(function(instance2){
      token = instance2;
      return token.INITIAL_SUPPLY();
    });
  });

it("user should first get tokens from tier 3, then tier 2, then tier 1, then tier 4", async function() {
    // ETH : QSP rates dependi on the tier
    const tier1rate = (await sale.rate1()).toNumber();
    const tier2rate = (await sale.rate2()).toNumber();
    const tier3rate = (await sale.rate3()).toNumber();
    const tier4rate = (await sale.rate4()).toNumber();

    // tier caps for each of the users; 0-indexed
    const tier1cap = 2, tier2cap = 3, tier3cap = 4, tier4cap = 5;

    await token.setCrowdsale(sale.address, 0);

    await sale.registerUser(user2,
        util.toEther(tier1cap), util.toEther(tier2cap), util.toEther(tier3cap), util.toEther(tier4cap), {from:owner});

    // 1 ETH is well below the tier 3 cap
    await sale.sendTransaction({value : util.toEther(1), from : user2});
    assert.equal((await token.balanceOf(user2)).toNumber(), util.toQsp(tier3rate));

    // Sending more ETH should fill tier 3 and 2
    await sale.sendTransaction({value : util.toEther(4), from : user2});
    assert.equal((await token.balanceOf(user2)).toNumber(), util.toQsp((tier3rate * tier3cap) + (tier2rate * 1)));

    await sale.sendTransaction({value : util.toEther(1), from : user2});
    assert.equal((await token.balanceOf(user2)).toNumber(), util.toQsp((tier3rate * tier3cap) + (tier2rate * 2)));

    // tiers 2, 1, and 4
    await sale.sendTransaction({value : util.toEther(4), from : user2});
    assert.equal((await token.balanceOf(user2)).toNumber(), util.toQsp(
        (tier3rate * tier3cap) + (tier2rate * tier2cap) + (tier1rate * tier1cap) + (tier4rate * 1)
    ));
});

it("user should not be able to contribute more than allowed by the caps", async function() {
    // ETH : QSP rates dependi on the tier
    const tier1rate = (await sale.rate1()).toNumber();
    const tier2rate = (await sale.rate2()).toNumber();
    const tier3rate = (await sale.rate3()).toNumber();
    const tier4rate = (await sale.rate4()).toNumber();

    // tier caps for each of the users; 0-indexed
    const tier1cap = 0, tier2cap = 0, tier3cap = 0, tier4cap = 1;

    await token.setCrowdsale(sale.address, 0);
    await sale.registerUser(user3,
        util.toEther(tier1cap), util.toEther(tier2cap), util.toEther(tier3cap), util.toEther(tier4cap), {from:owner});
    await util.expectThrow(sale.sendTransaction({value : util.toEther(2), from : user3}));    
});

/*
  it("should be an allowance so that the crowdsale can transfer the tokens", async function() {
      let crowdSaleBalance = (await token.crowdSaleSupply()).toNumber();
      await token.setCrowdsale(sale.address, crowdSaleBalance);
      let allowance = (await token.allowance(owner, sale.address)).toNumber();
      assert.equal(allowance, crowdSaleBalance);
  });

  it("should be able to send tokens to user from crowdsale allowance", async function() {
      let allowance = (await token.allowance(owner, sale.address)).toNumber();
      await sale.testTransferTokens(user1, allowance);

      // user has received all the tokens
      let user1Balance = (await token.balanceOf(user1)).toNumber();
      assert.equal(user1Balance, allowance, "The user should have received all the tokens");

      // crowdsale allowance is now 0
      allowance = (await token.allowance(owner, sale.address)).toNumber();
      assert.equal(allowance, 0, "The crowdsale should have an allowance of 0");
  });

});

contract('Multiple Crowdsales', function(accounts) {
  // account[0] points to the owner on the testRPC setup
  var owner = accounts[0];
  var user1 = accounts[1];
  var user2 = accounts[2];
  var user3 = accounts[3];

  beforeEach(function() {
    return QuantstampSale.deployed().then(function(instance) {
        sale = instance;
        return QuantstampToken.deployed();
    }).then(function(instance2){
      token = instance2;
      return token.INITIAL_SUPPLY();
    }).then(function(val){
      initialSupply = val.toNumber();
      return sale.rate();
    }).then(function(val){
      rate = val.toNumber();
      return QuantstampICO.deployed();
    }).then(function(instance3){
      ico = instance3;
      return ico.rate();
    }).then(function(val){
      ico_rate = val.toNumber();
    });
  });



  it("should accept 2 ether for the crowdfunding campaign", async function() {
      let crowdSaleAllowance = (await token.crowdSaleSupply()).toNumber();
      await token.setCrowdsale(sale.address, crowdSaleAllowance); // ensures crowdsale has allowance of tokens
      let tokenOwner = await token.owner();
      await sale.registerUser(user2, [util.hundredEther], [5000], 0, {from:owner});
      let rate = 5000;
      var amountEther = 2;
      var amountWei = web3.toWei(amountEther, "ether");

      let allowance = (await token.allowance(tokenOwner, sale.address)).toNumber();
      assert.equal(allowance, crowdSaleAllowance, "The allowance should be equal to the crowdsale allowance");

      await sale.sendTransaction({from: user2,  value: web3.toWei(amountEther, "ether")});

      let allowanceAfter = (await token.allowance(tokenOwner, sale.address)).toNumber();
      let user2BalanceAfter = (await token.balanceOf(user2)).toNumber();
      let ownerBalanceAfter = (await token.balanceOf(tokenOwner)).toNumber();

      assert.equal(allowance - (amountWei * rate), ownerBalanceAfter, "The crowdsale should have sent amountWei*rate miniQSP");
      assert.equal(user2BalanceAfter, amountWei * rate, "The user should have gained amountWei*rate miniQSP");
      assert.equal(allowanceAfter + user2BalanceAfter, crowdSaleAllowance, "The total tokens should remain the same");
  });

});




contract('QuantstampSale', function(accounts) {
  // account[0] points to the owner on the testRPC setup
  var owner = accounts[0];
  var user1 = accounts[1];
  var user2 = accounts[2];
  var user3 = accounts[3];


  it("should send 2 ether to the crowdfunding campaign", function(done) {
      var amountEther = 2;
      var amountRaisedAfterTransaction = web3.toWei(2, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          // return quantstamp.send(web3.toWei(amountEther, "ether"));
          return sale.sendTransaction({from: user3, value: web3.toWei(amountEther, "ether")})
      }).then(function(result) {
          return sale.amountRaised.call();
      }).then(function(value){
          console.log("amountRaised: " + value)
          assert.equal(value, amountRaisedAfterTransaction, "AmountRaised is not equal to the amount transferred");
      }).then(done).catch(done);
  });

  it("should send an additional 3 ether to the crowdfunding campaign", function(done) {
      var amountEther = 3;
      var amountRaisedAfterTransaction = web3.toWei(5, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return instance.sendTransaction({from: user2, value: web3.toWei(amountEther, "ether")});
      }).then(function(){
          return sale.amountRaised.call();
      }).then(function(value){
          console.log("amountRaised: " + value)
          assert.equal(value, amountRaisedAfterTransaction, "AmountRaised is not equal to the amount transferred");
      }).then(done).catch(done);
  });

  it("should pause and not accept payment", function(done) {
      var amountEther = 6;
      var amountRaisedAfterTransaction = web3.toWei(5, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return instance.pause();
      }).then(function(){
          return sale.sendTransaction({from: user2, value: web3.toWei(amountEther, "ether")});
      }).then(assert.fail).catch(function(error) {
          console.log(error.message);
          return sale.amountRaised.call();
      }).then(function(value){
          console.log("amountRaised: " + value)
          assert.equal(value, amountRaisedAfterTransaction, "AmountRaised changed even when paused");
      }).then(done).catch(done);
  });

  it("should not allow a user to unpause the contract", function(done) {
      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return instance.unpause({from: user1});
      }).then(assert.fail).catch(function(error) {
          console.log(error.message);
          return sale.paused.call();
      }).then(function(value){
          console.log("paused: " + value)
          assert.equal(value, true, "The contract should not be paused by a user");
      }).then(done).catch(done);
  });

  it("should unpause and now accept payment", function(done) {
      var amountEther = 6;
      var amountRaisedAfterTransaction = web3.toWei(11, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return sale.unpause();
      }).then(function(){
          return sale.sendTransaction({from: user2, value: web3.toWei(amountEther, "ether")});
      }).then(function(){
          return sale.amountRaised.call();
      }).then(function(value){
          console.log("amountRaised: " + value)
          assert.equal(value, amountRaisedAfterTransaction, "AmountRaised is not equal to the amount transferred");
      }).then(done).catch(done);
  });

  it("should not allow a user to pause the contract", function(done) {
      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return instance.pause({from: user1});
      }).then(assert.fail).catch(function(error) {
          console.log(error.message);
          return sale.paused.call();
      }).then(function(value){
          console.log("paused: " + value)
          assert.equal(value, false, "The contract should not be paused by a user");
      }).then(done).catch(done);
  });

  it("should send an additional 10 ether to the crowdfunding campaign, exceeding the cap", function(done) {
      var amountEther = 10;
      var amountRaisedAfterTransaction = web3.toWei(20, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return instance.sendTransaction({from: user2, value: web3.toWei(amountEther, "ether")});
      }).then(function(){
          return sale.amountRaised.call();
      }).then(function(value){
          console.log("amountRaised: " + value)
          assert.equal(value, amountRaisedAfterTransaction, "AmountRaised is not equal to the amount transferred");
      }).then(done).catch(done);
  });

  it("should not accept payment after reaching the cap", function(done) {
      var amountEther = 3;
      var amountRaisedAfterTransaction = web3.toWei(20, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return sale.sendTransaction({from: user3, value: web3.toWei(amountEther, "ether")});
      }).then(assert.fail).catch(function(error) {
          console.log(error.message);
          return sale.fundingCapIsReached.call();
      }).then(function(value){
          console.log("fundingCapIsReached: " + value);
          assert.equal(value, true, "AmountRaised changed even when paused");
      }).then(done).catch(done);
  });
*/
});

