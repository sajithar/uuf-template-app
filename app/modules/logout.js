function onSuccess(user){
    var log = new Log("logout");
    log.info("User logout success '" + stringify(user) + "'.");
}

function onFail(error){
    var log = new Log("logout");
    log.info("User logout failed '" + stringify(error) + "'.");
}