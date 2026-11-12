-- Chạy một lần khi volume PostgreSQL còn trống (docker-entrypoint-initdb.d), bằng tài khoản superuser.
-- Extension theo docs/thiet_ke_co_so_du_lieu.md mục 1.6. Migration đầu tiên của API cũng chạy
-- CREATE EXTENSION IF NOT EXISTS (cho máy chủ thật); ở đây bật sẵn để mọi database local đều có.

-- Database chính (POSTGRES_DB).
CREATE EXTENSION IF NOT EXISTS citext;    -- email không phân biệt hoa thường
CREATE EXTENSION IF NOT EXISTS unaccent;  -- tìm tiếng Việt không dấu
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- tìm gần đúng theo tên

-- template1: database tạo sau này (database cho test) tự có sẵn các extension.
\connect template1
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Database riêng cho test tích hợp của API (Jest + Supertest), để test không đụng dữ liệu dev.
CREATE DATABASE tps_test;
