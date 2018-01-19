IntuitionLaunch.deployed().then(function(instance){q=instance});
IntuitionToken.deployed().then(function(instance){t=instance});
acc = web3.eth.accounts


contract = IntuitionLaunch.at(IntuitionLaunch.address);
var event = contract.TokenAddressEvent();
event.watch(function(err, result){ console.log(result.args) });
