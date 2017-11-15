var QuantstampSale = artifacts.require("./QuantstampMainSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");

var bigInt = require("big-integer");



contract('QuantstampSale.terminate()', function(accounts) {
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

  it("should terminate the crowdsale", async function() {
    var flag = false;

    // should be false to start
    let saleClosed = await sale.saleClosed();
    assert.equal(saleClosed, false);

    // should be true after call to terminate()
    await sale.terminate();
    saleClosed = await sale.saleClosed();
    assert.equal(saleClosed, true);

    // should remain true if you call it again
    await sale.terminate();
    saleClosed = await sale.saleClosed();
    assert.equal(saleClosed, true);

    // should not be able to send ether to sale
    try {
      web3.eth.sendTransaction({ from: user2, to: sale.address, value: web3.toWei(1) });
    }
    catch (e) {
      assert.equal(web3.eth.getBalance(sale.address), 0);
      flag = true;
    }

    if (!flag) {
      throw new Error("ether should not have been received because the crowdsale was terminated");
    }
  });

});
