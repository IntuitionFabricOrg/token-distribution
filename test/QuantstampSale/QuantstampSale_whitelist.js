var QuantstampSale = artifacts.require("./QuantstampSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");

var util = require("../util.js");
var bigInt = require("big-integer");

contract('Whitelist Crowdsale', function(accounts) {

    var owner = accounts[0];
    var beneficiary = accounts[1];
    var user2 = accounts[2];
    var user3 = accounts[3];
    var user4 = accounts[4];
    var user5 = accounts[5];
    var user6 = accounts[6];

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

    async function getCaps (addr) {
      const c1 = (await sale.cap1(addr)).toNumber();
      const c2 = (await sale.cap2(addr)).toNumber();
      const c3 = (await sale.cap3(addr)).toNumber();
      const c4 = (await sale.cap4(addr)).toNumber();
      return {c1, c2, c3, c4};
    };

    async function getContributions (addr) {
      const c1 = (await sale.contributed1(addr)).toNumber();
      const c2 = (await sale.contributed2(addr)).toNumber();
      const c3 = (await sale.contributed3(addr)).toNumber();
      const c4 = (await sale.contributed4(addr)).toNumber();
      return {c1, c2, c3, c4};
    };

    it("should add user2 to the whitelist, deactivate, and reactivate", async function() {
        // 0 indicates all crowdsale tokens
        await token.setCrowdsale(sale.address, 0); // ensures crowdsale has allowance of tokens

        var r = await sale.registerUser(user2, util.oneEther, util.twoEther, util.hundredEther, util.oneEther, {from:owner});

        assert.equal(r.logs[0].event, 'RegistrationStatusChanged', "event is wrong");
		assert.equal(r.logs[0].args.target, user2, "target is wrong");
		assert.equal(r.logs[0].args.isRegistered, true, "isRegistered is wrong");
		assert.equal(r.logs[0].args.c1, util.oneEther, "cap1 is wrong");
		assert.equal(r.logs[0].args.c2, util.twoEther, "cap2 is wrong");
		assert.equal(r.logs[0].args.c3, util.hundredEther, "cap3 is wrong");
		assert.equal(r.logs[0].args.c4, util.oneEther, "cap4 is wrong");

		//let user2cap = await sale.userCapInWei.call(user2);
		//console.log(user2cap);

		var r = await sale.deactivate(user2,{from:owner});
		assert.equal(r.logs[0].event, 'RegistrationStatusChanged', "event is wrong");
		assert.equal(r.logs[0].args.target, user2, "target is wrong");
		assert.equal(r.logs[0].args.isRegistered, false, "isRegistered is wrong");

		// cannot deactivate after already deactivating (already out of registry)
        await util.expectThrow(sale.deactivate(user2,{from:owner}));

		var r = await sale.reactivate(user2,{from:owner});
		assert.equal(r.logs[0].event, 'RegistrationStatusChanged', "event is wrong");
		assert.equal(r.logs[0].args.target, user2, "target is wrong");
		assert.equal(r.logs[0].args.isRegistered, true, "isRegistered is wrong");


    });

    it("should not be able to reactivate a user that was never registered", async function() {
        // 0 indicates all crowdsale tokens
        await util.expectThrow(sale.reactivate(user3, {from:owner}));
    });

    it("should allow user2 to buy tokens up to their limit", async function() {
        // 0 indicates all crowdsale tokens
        await token.setCrowdsale(sale.address, 0); // ensures crowdsale has allowance of tokens

        await sale.registerUser(user2, 0, 0, util.twoEther, 0, {from:owner});

        let user2Balance = (await token.balanceOf(user2)).toNumber();

        const caps = await getCaps(user2);
        console.log("CAPS: " + caps.c1 + " " + caps.c2 + " " + caps.c3 + " " + caps.c4);
        const contributed = await getContributions(user2);
        console.log("CTRB: " + contributed.c1 + " " + contributed.c2 + " " + contributed.c3 + " " + contributed.c4);


        await sale.sendTransaction({from: user2,  value: util.oneEther});

        let user2BalanceAfter1 = (await sale.tokenBalanceOf(user2)).toNumber();

        const caps2 = await getCaps(user2);
        console.log("CAPS: " + caps2.c1 + " " + caps2.c2 + " " + caps2.c3 + " " + caps2.c4);
        const contributed2 = await getContributions(user2);
        console.log("CTRB: " + contributed2.c1 + " " + contributed2.c2 + " " + contributed2.c3 + " " + contributed2.c4);

        assert.equal(user2Balance + util.oneEther * 6000, user2BalanceAfter1, "token balance of user is incorrect 1");
        await sale.sendTransaction({from: user2,  value: util.oneEther});

        let user2BalanceAfter2 = (await sale.tokenBalanceOf(user2)).toNumber();

        assert.equal(user2Balance + util.twoEther * 6000, user2BalanceAfter2, "token balance of user is incorrect 2");

        const caps3 = await getCaps(user2);
        console.log("CAPS: " + caps3.c1 + " " + caps3.c2 + " " + caps3.c3 + " " + caps3.c4);
        const contributed3 = await getContributions(user2);
        console.log("CTRB: " + contributed3.c1 + " " + contributed3.c2 + " " + contributed3.c3 + " " + contributed3.c4);

        // should now fail
        await util.expectThrow(sale.sendTransaction({from: user2,  value: util.oneEther}));
    });



    it("should allow multiple users to be added to the whitelist", async function() {
        var addresses = [user4, user5, user6];
        var caps = [util.oneEther, util.twoEther, util.threeEther];

        await sale.registerUsers(addresses, caps, caps, caps, caps, {from:owner});

        await sale.sendTransaction({from: user4,  value: util.oneEther});
        await sale.sendTransaction({from: user5,  value: util.oneEther});
        await sale.sendTransaction({from: user6,  value: util.twoEther});

        let saleBalance4 = (await sale.balanceOf(user4)).toNumber();
        let saleBalance5 = (await sale.balanceOf(user5)).toNumber();
        let saleBalance6 = (await sale.balanceOf(user6)).toNumber();


        let token4 = (await sale.tokenBalanceOf(user4)).toNumber();
        let token5 = (await sale.tokenBalanceOf(user5)).toNumber();
        let token6 = (await sale.tokenBalanceOf(user6)).toNumber();

        assert.equal(saleBalance4, util.oneEther, "User4 sale balance is wrong");
        assert.equal(saleBalance5, util.oneEther, "User5 sale balance is wrong");
        assert.equal(saleBalance6, util.twoEther, "User6 sale balance is wrong");


        assert.equal(token4, 6000 * util.oneEther, "User4 token balance is wrong");
        assert.equal(token5, 6000 * util.oneEther, "User5 token balance is wrong");
        assert.equal(token6, 6000 * util.twoEther, "User6 token balance is wrong");
    });

    it("should not allow different size lists when changing many registration statuses", async function() {
        var addresses3 = [user4, user5, user6];
        var caps3 = [util.oneEther, util.twoEther, util.threeEther];

        var addresses2 = [user4, user5];
        var caps2 = [util.oneEther, util.threeEther];

        await util.expectThrow(sale.registerUsers(addresses2, caps2, caps2, caps2, caps3, {from: owner}));
        await util.expectThrow(sale.registerUsers(addresses2, caps2, caps2, caps3, caps2, {from: owner}));
        await util.expectThrow(sale.registerUsers(addresses2, caps2, caps3, caps2, caps2, {from: owner}));
        await util.expectThrow(sale.registerUsers(addresses2, caps3, caps2, caps2, caps2, {from: owner}));
    });

});
