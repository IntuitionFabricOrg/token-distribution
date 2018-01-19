// These tests correspond with JIRA tickets

var IntuitionLaunch = artifacts.require("./IntuitionLaunch.sol");
var IntuitionToken = artifacts.require("./IntuitionToken.sol");

contract('AIT-02: Capacity Constraint', function(accounts) {
  // account[0] points to the owner on the testRPC setup
  var owner = accounts[0];
  var user1 = accounts[1];
  var user2 = accounts[2];
  var user3 = accounts[3];

  beforeEach(function() {
    return IntuitionLaunch.deployed().then(function(instance) {
        sale = instance;
        return IntuitionToken.deployed();
    }).then(function(instance2){
      token = instance2;
      return token.INITIAL_SUPPLY();
    });
  });

  it("crowdsale should stop accepting contributions when cap is reached", async function() {
    await token.setLaunch(sale.address, 0);
    let capacity = (await sale.fundingCap()).toNumber();

    // this send should work since capacity is not yet reached,
    // but it will be reached after this send completes
    await sale.send(capacity);

    let amountRaised = (await sale.amountRaised()).toNumber();
    let fundingCapReached = await sale.fundingCapReached();
    let crowdsaleClosed = await sale.saleClosed();

    assert.equal(amountRaised, capacity);
    assert.equal(fundingCapReached, true);
    assert.equal(crowdsaleClosed, true);

    // Try to send more. This should fail.
    try {
        await sale.send(1);
    }
    catch (e) {
        return true;
    }
    throw new Error("a user was able to send funds after the cap was reached and crowdsale was closed")
  });

});