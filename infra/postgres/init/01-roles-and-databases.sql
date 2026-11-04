-- Runs once, when the Postgres volume is first created.
-- tps_owner runs migrations. tps_app is what the running application uses.
-- Separate roles let the database refuse changes to audit_logs (NFR-S08).
CREATE ROLE tps_owner LOGIN PASSWORD 'tps_owner_dev';
CREATE ROLE tps_app LOGIN PASSWORD 'tps_app_dev';

CREATE DATABASE tps OWNER tps_owner;
CREATE DATABASE tps_test OWNER tps_owner;

\connect tps
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO tps_owner;
GRANT USAGE ON SCHEMA public TO tps_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tps_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tps_app;

\connect tps_test
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO tps_owner;
GRANT USAGE ON SCHEMA public TO tps_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tps_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tps_app;
