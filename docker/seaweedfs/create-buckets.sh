#!/bin/sh
# Tạo bucket nếu chưa có. Chạy lại nhiều lần vẫn an toàn.
set -eu

existing=$(echo "s3.bucket.list" | weed shell -master=seaweedfs:9333 2>/dev/null || true)

for bucket in "$S3_BUCKET_PUBLIC" "$S3_BUCKET_PRIVATE"; do
  if echo "$existing" | grep -q "^ *$bucket\b"; then
    echo "bucket $bucket: đã có"
  else
    echo "s3.bucket.create -name $bucket" | weed shell -master=seaweedfs:9333
    echo "bucket $bucket: đã tạo"
  fi
done
