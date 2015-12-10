function onSuccess(user){
    var log = new Log("login");
    log.info("User login success '" + stringify(user) + "'.");
}

function onFail(error){
    var log = new Log("login");
    log.info("User login failed '" + stringify(error) + "'.");
}