#!/bin/bash
mkdir -p /mlflow/db /artifacts
chmod -R 777 /mlflow /artifacts

exec mlflow server \
    --backend-store-uri sqlite:////mlflow/db/mlflow.db \
    --artifacts-destination /artifacts \
    --serve-artifacts \
    --host 0.0.0.0 \
    --port 5000 \
    --allowed-hosts "mlflow:5000,mlflow,localhost:5001,localhost,127.0.0.1:5001,127.0.0.1"