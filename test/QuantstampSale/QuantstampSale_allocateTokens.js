var QuantstampSale = artifacts.require("./QuantstampMainSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");


var util = require("../util.js");
var bigInt = require("big-integer");



contract('QuantstampSale.allocateTokens:', function(accounts) {
  // account[0] points to the owner on the testRPC setup
  var owner = accounts[0];
  var user1 = accounts[1];
  var user2 = accounts[2];
  var user3 = accounts[3];

  beforeEach(
    function() {
        return QuantstampSale.deployed().then(
    function(instance) {
        sale = instance;
        return QuantstampToken.deployed();
    }).then(
    function(instance2){
        token = instance2;
        return token.INITIAL_SUPPLY();
    });
  });

  it("should not allow non-owners to call ownerSafeWithdraw", async function() {
    await token.setCrowdsale(sale.address, 0);
    await util.expectThrow(sale.allocateTokens(user3, util.oneEther, util.twoEther, {from:user2}));
    await util.expectThrow(sale.allocateTokens(user3, util.oneEther, util.twoEther, {from:user1}));
  });

  it("should not transfers to administrative acccounts", async function() {
    await util.expectThrow(sale.allocateTokens(user1, util.oneEther, util.twoEther, {from:owner}));
    await util.expectThrow(sale.allocateTokens(user1, util.oneEther, util.twoEther, {from:owner}));
    let addrList = [user1, user3];
    let amtsList = [util.oneEther, util.twoEther];
    //await util.expectThrow(sale.allocateTokensForList(addrList, amtsList, amtsList, {from:owner}));
  });

  it("should allow transfers to registered users, even beyond caps", async function(){
    let caps = [util.oneEther, util.oneEther, util.oneEther, util.twoEther];
    await sale.registerUser(user2);
    await sale.registerUser(user3);

    await sale.allocateTokens(user2, util.oneEther, util.oneEther, {from:owner});

    await sale.allocateTokens(user3, util.twoEther, util.oneEther, {from:owner});
    let addrList = [user2, user3];
    let amtsList = [util.oneEther, util.twoEther];
    let user2_balance = await(sale.balanceOf(user2));
    let user2_token_balance = await(token.balanceOf(user2));
    //await sale.allocateTokensForList(addrList, amtsList, amtsList, {from:owner});
    await sale.allocateTokens(user2, util.oneEther, util.oneEther, {from:owner});
    await sale.allocateTokens(user3, util.twoEther, util.twoEther, {from:owner});


    let reached_cap = await sale.fundingCapReached();
    let user2_balance_after = await(sale.balanceOf(user2));
    let user2_token_balance_after = await(token.balanceOf(user2));
    console.log(user2_balance.add(util.oneEther) + " " + user2_balance_after + " " + reached_cap);
    assert.equal(user2_balance.add(util.oneEther).toNumber(), user2_balance_after.toNumber(), "user2 ether balance should have increased by 1");
    assert.equal(user2_token_balance.add(util.oneEther).toNumber(), user2_token_balance_after.toNumber(), "user2 token balance should have increased by 1");

  });

  it("should allow transfers to unregistered users", async function(){
    await sale.deactivate(user2, {from:owner});
    await sale.allocateTokens(user2, util.oneEther, util.oneEther, {from:owner});
  });



});