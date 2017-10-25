// These tests correspond with JIRA tickets

var QuantstampSale = artifacts.require("./QuantstampSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var util = require("./util.js");
var bigInt = require("big-integer");


contract('QSP-15: Capacity Constraint', function(accounts) {
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

  it("crowdsale should stop accepting contributions when cap is reached", async function() {
    await token.setCrowdsale(sale.address, 0);
    await sale.changeRegistrationStatus(user2, true, util.hundredEther, 5000, 0, {from:owner});

    let capacity = (await sale.fundingCap()).toNumber();

    // this send should work since capacity is not yet reached,
    // but it will be reached after this send completes
    await sale.sendTransaction({from: user2, value: capacity});
    let amountRaised = (await sale.amountRaised());
    let fundingCapReached = await sale.fundingCapReached();
    let crowdsaleClosed = await sale.saleClosed();

    assert.equal(amountRaised, capacity);
    assert.equal(fundingCapReached, true);
    assert.equal(crowdsaleClosed, true);

    // Try to send more. This should fail.
    await util.expectThrow(sale.sendTransaction({from: user2,  value: util.oneEther}));
  });

});