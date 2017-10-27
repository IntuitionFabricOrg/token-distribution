var QuantstampSale = artifacts.require("./QuantstampSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var util = require("../util.js")
var bigInt = require("bignumber.js");

contract('Multiple Crowdsales', function(accounts) {
    // account[0] points to the owner on the testRPC setup
    var owner = accounts[0];
    var beneficiary = accounts[1];
    var user2 = accounts[2];
    var user3 = accounts[3];

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

    it("should accept 2 ether for the crowdsale", async function() {
        // 0 indicates all crowdsale tokens
        await token.setCrowdsale(sale.address, 0); // ensures crowdsale has allowance of tokens
        await sale.registerUser(user2, [util.hundredEther], [5000], 0, {from:owner});

        let allowance = (await token.allowance(tokenOwner, sale.address));

        await sale.sendTransaction({from: user2,  value: util.twoEther});

        let allowanceAfter = (await token.allowance(tokenOwner, sale.address));
        let user2BalanceAfter = (await token.balanceOf(user2));
        let ownerBalanceAfter = (await token.balanceOf(owner));
        let subbedAllowance = allowance.minus(util.twoEther * 5000);

        assert.equal(subbedAllowance.toNumber(), allowanceAfter.toNumber(), "The crowdsale should have sent amountWei*rate miniQSP");

        assert.equal(user2BalanceAfter, (util.twoEther * 5000), "The user should have gained amountWei*rate miniQSP");
        assert.equal((allowanceAfter.plus(user2BalanceAfter)).toNumber(), allowance.toNumber(), "The total tokens should remain the same");
    });

    it("should accept another 10 ether, reaching the goal", async function() {
        var amountEther = 10;
        var amountWei = web3.toWei(amountEther, "ether");

        let allowance = (await token.allowance(tokenOwner, sale.address)).toNumber();

        await sale.sendTransaction({from: user2,  value: web3.toWei(amountEther, "ether")});

        let allowanceAfter = (await token.allowance(tokenOwner, sale.address)).toNumber();
        let user2BalanceAfter = (await token.balanceOf(user2)).toNumber();
        let ownerBalanceAfter = (await token.balanceOf(tokenOwner)).toNumber();

        assert.equal(allowance - (amountWei * 5000), allowanceAfter, "The crowdsale should have sent amountWei*rate miniQSP");
        assert.equal(user2BalanceAfter, web3.toWei(12, "ether") * 5000, "The user should have gained amountWei*rate miniQSP");
        assert.equal(allowanceAfter + user2BalanceAfter, crowdsaleSupply, "The total tokens should remain the same");
    });

    it("should transfer the ether balance of the sale crowdsale back to the owner", async function() {
        let saleEthBalance = (await web3.eth.getBalance(sale.address)).toNumber();
        let beneficiaryEthBalance = (await web3.eth.getBalance(beneficiary)).toNumber();

        await sale.ownerSafeWithdrawal();

        let saleBalanceAfter = (await web3.eth.getBalance(sale.address)).toNumber();
        let beneficiaryBalanceAfter = (await web3.eth.getBalance(beneficiary)).toNumber();

        assert.equal(saleBalanceAfter, 0, "The crowdsale should no longer have ether associated with it");
        assert.equal(beneficiaryEthBalance + saleEthBalance, beneficiaryBalanceAfter, "The beneficiary should have gained that amount of ether");
    });

    it("the owner of QuantstampToken should now issue allowance to a new crowdsale", async function() {
        let time = new Date().getTime() / 1000;
        sale2 = await QuantstampSale.new(accounts[1], 10, 20, 1, time, 2, token.address);
        await token.setCrowdsale(sale2.address, 0); // ensures crowdsale has allowance of tokens
        let saleAllowance = (await token.allowance(tokenOwner, sale.address)).toNumber();
        let sale2Allowance = (await token.allowance(tokenOwner, sale2.address)).toNumber();

        let crowdsaleAllowance = (await token.crowdSaleAllowance()).toNumber();

        assert.equal(saleAllowance, 0, "The old crowdsale should have zero allowance");
        assert.isAbove(sale2Allowance, 0, "The new crowdsale should have an allowance greater than zero");
        assert.equal(sale2Allowance, crowdsaleAllowance, "The new crowdsale should have a balance equal to the current allowance");
        assert.isBelow(sale2Allowance, crowdsaleSupply, "The new crowdsale should have a balance less than the supply");
    });

    it("should accept 2 ether for the new crowdsale", async function() {
        let allowance = (await token.allowance(tokenOwner, sale2.address));

        let user2Balance = (await token.balanceOf(user2)).toNumber();
        await sale2.registerUser(user2, [util.hundredEther], [6000], 0, {from:owner});

        await sale2.sendTransaction({from: user2,  value: util.twoEther});

        let allowanceAfter = (await token.allowance(tokenOwner, sale2.address));
        let user2BalanceAfter = (await token.balanceOf(user2)).toNumber();
        let ownerBalanceAfter = (await token.balanceOf(owner)).toNumber();

        let weiTransferred = (util.twoEther * 6000);

        let sum = new bigInt(allowanceAfter).add(weiTransferred);

        //assert.equal(allowance - diff, allowanceAfter, "The crowdsale should have sent amountWei*rate miniQSP");
        assert.equal(user2BalanceAfter, user2Balance + (util.twoEther * 6000), "The user should have gained amountWei*rate miniQSP");
        assert.equal(sum.toNumber(), allowance, "The total tokens should remain the same");
    });

});
