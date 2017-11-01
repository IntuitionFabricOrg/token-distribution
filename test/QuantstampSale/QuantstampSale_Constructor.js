var QuantstampSale = artifacts.require("./QuantstampSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");

var bigInt = require("big-integer");

contract('QuantstampSale Constructor', function(accounts) {
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

  it("should have the correct parameters, and calculate the end time correctly", async function() {
    let beneficiary = accounts[1];

    let tokenReward               = await sale.tokenReward();
    assert.equal(token.address, tokenReward);

    let amountRaised              = (await sale.amountRaised()).toNumber();
    let refundAmount              = (await sale.refundAmount()).toNumber();

    assert.equal(amountRaised, 0);
    assert.equal(refundAmount, 0);

    let ifSuccessfulSendTo        = await sale.beneficiary();
    let fundingCapInEthers        = (await sale.fundingCap()).toNumber();
    let minimumContributionInWei  = (await sale.minContribution()).toNumber();
    let start                     = (await sale.startTime()).toNumber();
    let end                       = (await sale.endTime()).toNumber();

    assert.equal(ifSuccessfulSendTo, beneficiary, "beneficiary address is incorrect");
    assert.equal(fundingCapInEthers, 20 * (10 ** 18), "funding cap is incorrect");
    assert.equal(minimumContributionInWei, 1, "minimum contribution in wei is incorrect");
    assert.equal(start + 120, end, "end time should be 120 seconds after start time");
  });

});
