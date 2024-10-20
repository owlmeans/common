# OwlMeans Common
OwlMeans Common libraries that simplifies projects development 

## OwlMeans Package structure
### In package idioms
* types - different types including POJO types 
* consts - some static values and key names
* model - wrapper object with function for POJO that adds behaviour to a model
* * Model is made (make) by maker from a POJO type (may combine make and create functionality, see further)
* * The POJO itself can be created with create* functions
* util - some functions for internal use that produce some library related results in an abstract way (isn't included in imports)
* helper - set of functions (like util) that help to use models and POJOs but more related to consumers capabilities rather than domain (e.g. UI conditions)
* service - set of function that represented domain without bounding to one specific model
* resource - set of functions that allows to use stored or remote entities sets
* plugins - type specific model implementations (aren't imported by default)
* * live in plugins dir
* * plugins dir has export.ts file to provide all exports to other libraries that want to add their plugins
### Package kinds
* package without standard suffixes or prefixes is a common package mostly containing models and env unspecific logic and implementations
* server - server side library
* client - client side library. Implementation unspecific. It may contain react code but not implementation specific. May not contain rendering components (only HOCs)
* web - frontend (web html) implementation of a library. Will conatain react code. Will contain some components with UI.
* api - subset of packages working via web or web socket API
* common - in some cases basic package has a lots of references, in this case it's dependency cycle unsefe to put there
  dependencies of higher level. So we use common suffix to create more robust version of basic package with high level
  dependencies.
### Concepts
* route - cross environmnet strcuture consisting of URLs, URIs, aliases, permissions, and validations (it's POJO)
* module - bring together route and related handlers, adding all implmenetation specific middlewares, hidrate routes with all necessary services (it's like a model for a route)
* context - in fact this can be treated as an application instance. The only difference there can be multiple contexts
  in one application with different capabilities depending on the complexity of operation and its dependencies.
* config - configuration of context

## Configuration helper function
### config (makeFunction)
Destruct function to build a final config object. It makes sure that you get a new object.
### service
Added an infrastructure service config to a config
### addWebService
Register an internal application service that is capable to make API requests 

### Counters (for monorepo maintenance)
We use delayes on dev command for the whole repository to not overwhelme processors.
* Even counter: 60, 40 (got through once); Free: 14, 12, 2, 4, 12, 10, 8, 28, 30
* Odd counter: 59, (got through once); Free: 1, 47, 45, 31, 29, 27, 53, 37
