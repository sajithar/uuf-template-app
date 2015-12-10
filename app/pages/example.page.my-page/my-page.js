function onRequest(context) {
    new Log("MY").info(stringify(Object.keys(context)));
}