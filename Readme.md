# Platzigram Data Base

## Description

Data base application to support platzi backend storage build on rethinkDB.
Javascript libraries as co, bluebird to handle asynchronous behavior according to best javascript development practices. 
Also AVA for testing, standard & lint for best coding guidelines.

functionalities:

1. Connect DB
2. Disconnect DB
3. Save image
4. Like image
5. Get Image
6. Get Images
7. Save user
8. Get user
9. Authenticate
10. Get images by user
11. Get images by tag

## Installation

It´s needed DB creation on rethinkDB prior to application setup. 
 
## Usage

```
import Db from 'platzigram-db'
let db = new Db(config.db)  // config.db --> configuration file 
```

##Credits

- [René Marulanda](https://twitter.com/MaruloRenacuajo)

##License

[MIT](https://opensource.org/licenses/MIT)


