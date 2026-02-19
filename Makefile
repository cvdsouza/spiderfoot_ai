.PHONY: help dev build-frontend test lint clean docker

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start development servers (API + frontend with hot reload)
	@echo "Starting SpiderFoot development servers..."
	@cd frontend && npm run dev &
	@python sf.py -l 127.0.0.1:5001

build-frontend: ## Build the React frontend for production
	cd frontend && npm run build

install: ## Install Python and frontend dependencies
	pip install -r requirements.txt
	cd frontend && npm install

test: ## Run Python tests
	python -m pytest test/ -v

test-coverage: ## Run tests with coverage
	python -m pytest test/ --cov=. --cov-report=term-missing

lint: ## Run linting
	cd frontend && npx tsc --noEmit

clean: ## Clean build artifacts
	rm -rf frontend/dist frontend/node_modules/.cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name '*.pyc' -delete 2>/dev/null || true

docker: build-frontend ## Build Docker image
	docker build -t spiderfoot .

docker-run: ## Run Docker container
	docker run -p 5001:5001 --security-opt no-new-privileges spiderfoot
