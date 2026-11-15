# Adiatelier — Backend

Backend API modules for **Adiatelier**, a student project exploring an adidas subbrand for young fashion designers. The concept gives emerging designers a place to share their work, enter fashion competitions and begin building a portfolio.

**Cassy Laurent’s role: lead developer.** The initial subbrand concept and design were created by a classmate. The team tested the experience with participants, offered a small thank-you gift, refined the design and functionality, and then developed the website.

## Project status

This repository currently contains Express route modules, a Neon database connection, Cloudinary configuration and an error handler.

It does **not yet include** a `package.json`, dependency lockfile, application entry point, database schema/migrations or automated tests. It is therefore a collection of backend modules rather than a standalone application that can be installed and started from this checkout. Start commands, a server port and a deployed API URL are not documented because they are not defined in the current repository.

## Technologies

| Technology | Purpose |
| --- | --- |
| Node.js / JavaScript | Backend runtime; modules use CommonJS |
| Express | HTTP route handlers |
| PostgreSQL via Neon | Database queries using `@neondatabase/serverless` |
| Cloudinary | Contribution image storage and thumbnail URLs |
| Multer | Multipart image uploads held in memory |
| Unsplash API | Photo search |
| iTunes Search API | Song search |

The external media routes use the runtime’s global `fetch` API. Exact dependency versions and a supported Node.js version still need to be recorded in the package manifest.

## Features in the source

- **Competitions:** browse competitions, view details and rules, save competitions, retrieve eligible entries, explore submissions and view leaderboards.
- **Contributions:** upload images, create a contribution, edit its content, select front/back preview images and publish through the editor flow.
- **Community interactions:** like and bookmark contributions, follow/unfollow profiles, and vote for competition entries.
- **Discovery:** home feed, contribution search, search suggestions and hashtag lookup.
- **Profiles:** profile details and contribution collections.
- **External media:** search for photos and songs to support the creative experience.

## Repository structure

```text
config/
  cloudinary.js          Cloudinary configuration from environment variables
db/
  index.js               Neon SQL connection
middleware/
  error_handler.js       Shared JSON error handler
routes/
  competitions/          Competition feeds, details, entries and leaderboards
  connections/           Follow and unfollow actions
  contributions/         Upload, edit, preview and interaction routes
  external/              Photo and song search integrations
  feed/                  Home feed
  hashtags/              Hashtag search
  profiles/              Profile details and contributions
  search/                Search feed and suggestions
```

## Local setup

Clone the repository:

```bash
git clone https://github.com/CassyStudent/Adi_Atelier-Backend-develops.git
cd Adi_Atelier-Backend-develops
```

Before it can run locally, the application needs:

1. A package manifest and lockfile declaring the dependencies imported by the modules: `express`, `@neondatabase/serverless`, `cloudinary` and `multer`.
2. A server entry point that loads environment variables before importing the modules, configures request parsing, mounts the routers and registers the error handler after the routes.
3. A PostgreSQL schema matching the queries, along with any required seed data.
4. The environment variables listed below.

The source comments describe intended endpoint paths, but the missing server entry point means the actual router mounts and any shared API prefix cannot yet be verified. No `npm install` or `npm start` workflow is available until the package files and server bootstrap are added.

### Environment variables

Supply these values in the backend environment. If a local `.env` file is used, the server must explicitly load it.

```dotenv
DATABASE_URL=your_neon_postgresql_connection_string
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
UNSPLASH_ACCESS_KEY=your_unsplash_access_key
```

`DATABASE_URL` is used by the database connection. The Cloudinary values are used by image uploads; `UNSPLASH_ACCESS_KEY` is needed for photo search. The current iTunes search route does not use an API key.

Keep real credentials out of source control. A `.gitignore` should exclude `.env`, local environment overrides and `node_modules/` before those files are added.

## API modules

These are the paths described in the route source comments, **not a confirmed running API contract**. The final URLs depend on how the routers are mounted.

| Area | Intended routes |
| --- | --- |
| Competitions | `GET /competitions`, `GET /competitions/:competitionId/overview`, `GET /competitions/:competitionId/contributions`, `GET /competitions/:competitionId/entry-options`, `GET /competitions/:competitionId/leaderboard`, `PATCH /competitions/:competitionId/save` |
| Contributions | `POST /contributions/init`, `GET /contributions/:contributionId`, `GET/PATCH /contributions/:contributionId/editor`, `GET/PATCH /contributions/:contributionId/preview` |
| Interactions | `PATCH /contributions/:contributionId/like`, `PATCH /contributions/:contributionId/bookmark`, `PATCH /contributions/:contributionId/vote`, `PATCH /connections/follow` |
| Profiles | `GET /profiles/:profileId`, `GET /profiles/:profileId/contributions` |
| Discovery | `GET /feed/home`, `GET /search/feed`, `GET /search/suggestions`, `GET /hashtags/search` |
| External media | `GET /api/songs`, `GET /api/photos` |

For request fields and response shapes, refer to the corresponding files in [routes/](routes/).

### Contribution upload flow

1. Send a multipart request to the initialization route with a `profileId` and at least two files under the `images` field.
2. Images are uploaded to Cloudinary and their URLs are stored in the database.
3. The response provides the contribution ID, media items and default front/back preview selections.
4. The preview and editor routes handle subsequent image selection and contribution details.

## Integration notes

The database schema must support the tables referenced by the modules, including profiles, contributions, images, competitions, entries, reactions, saved items, connections, hashtags, votes and leaderboards. No database creation or migration command is supplied in this checkout.

Several routes accept user or profile identifiers in request parameters or bodies. Authentication and authorization middleware are not included in the current repository and must be integrated before treating those identifiers as a trusted user identity.

This is an independent student concept for an adidas subbrand.

