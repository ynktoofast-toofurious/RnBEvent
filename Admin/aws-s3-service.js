/**
 * AWS S3 Service Module for RNB Events Admin
 * Handles all S3 operations for data storage and retrieval
 */

(function() {
    'use strict';

    const S3_CONFIG = {
        bucket: 'rnbevents716',
        region: 'us-east-2',
        baseUrl: 'https://rnbevents716.s3.us-east-2.amazonaws.com',
        apiGateway: 'https://api.rnbevents716.com'
    };

    // Data paths in S3
    const S3_PATHS = {
        prospects: 'admin-data/prospects.json',
        clients: 'admin-data/clients.json',
        tasks: 'admin-data/tasks.json',
        inventory: 'admin-data/inventory.json',
        inventoryImages: 'admin-data/inventory/images/',
        quotes: 'admin-data/quotes.json',
        stats: 'admin-data/stats.json'
    };

    class S3Service {
        constructor() {
            this.cache = new Map();
            this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        }

        /**
         * Fetch data from S3 via API Gateway (with Lambda proxy)
         */
        async fetchFromS3(path, useCache = true) {
            const cacheKey = `s3:${path}`;
            
            if (useCache && this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheExpiry) {
                    return cached.data;
                }
            }

            try {
                const response = await fetch(`${S3_CONFIG.apiGateway}/s3-data?path=${encodeURIComponent(path)}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'omit'
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        const s3Read = await fetch(`${S3_CONFIG.baseUrl}/${path}?_t=${Date.now()}`, {
                            method: 'GET',
                            credentials: 'omit'
                        });
                        if (!s3Read.ok) {
                            throw new Error(`S3 fetch failed: ${s3Read.status}`);
                        }
                        const fallbackData = await s3Read.json();
                        if (useCache) {
                            this.cache.set(cacheKey, {
                                data: fallbackData,
                                timestamp: Date.now()
                            });
                        }
                        return fallbackData;
                    }
                    throw new Error(`S3 fetch failed: ${response.status}`);
                }

                const data = await response.json();
                
                if (useCache) {
                    this.cache.set(cacheKey, {
                        data,
                        timestamp: Date.now()
                    });
                }

                return data;
            } catch (error) {
                console.error('S3 fetch error:', error);
                throw error;
            }
        }

        /**
         * Save data to S3 via API Gateway
         */
        async saveToS3(path, data) {
            try {
                const response = await fetch(`${S3_CONFIG.apiGateway}/s3-data`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        path,
                        data
                    }),
                    credentials: 'omit'
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        return {
                            ok: false,
                            skipped: true,
                            reason: 's3-data-route-unavailable'
                        };
                    }
                    throw new Error(`S3 save failed: ${response.status}`);
                }

                // Clear cache for this path
                this.cache.delete(`s3:${path}`);

                return await response.json();
            } catch (error) {
                console.error('S3 save error:', error);
                throw error;
            }
        }

        /**
         * Upload file (image, etc.) to S3
         */
        async uploadFile(file, path) {
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('path', path);

                const response = await fetch(`${S3_CONFIG.apiGateway}/s3-upload`, {
                    method: 'POST',
                    body: formData,
                    credentials: 'omit'
                });

                if (!response.ok) {
                    throw new Error(`File upload failed: ${response.status}`);
                }

                return await response.json();
            } catch (error) {
                console.error('File upload error:', error);
                throw error;
            }
        }

        /**
         * Delete file from S3
         */
        async deleteFile(path) {
            try {
                const response = await fetch(`${S3_CONFIG.apiGateway}/s3-data`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ path }),
                    credentials: 'omit'
                });

                if (!response.ok) {
                    throw new Error(`File delete failed: ${response.status}`);
                }

                return await response.json();
            } catch (error) {
                console.error('File delete error:', error);
                throw error;
            }
        }

        /**
         * Get public URL for S3 object
         */
        getPublicUrl(path) {
            return `${S3_CONFIG.baseUrl}/${path}`;
        }

        /**
         * Clear cache
         */
        clearCache() {
            this.cache.clear();
        }

        /**
         * Clear specific cache entry
         */
        clearCacheEntry(path) {
            this.cache.delete(`s3:${path}`);
        }

        // ===== Data-specific methods =====

        async getProspects() {
            return await this.fetchFromS3(S3_PATHS.prospects);
        }

        async saveProspects(prospects) {
            return await this.saveToS3(S3_PATHS.prospects, prospects);
        }

        async getClients() {
            return await this.fetchFromS3(S3_PATHS.clients);
        }

        async saveClients(clients) {
            return await this.saveToS3(S3_PATHS.clients, clients);
        }

        async getTasks() {
            return await this.fetchFromS3(S3_PATHS.tasks);
        }

        async saveTasks(tasks) {
            return await this.saveToS3(S3_PATHS.tasks, tasks);
        }

        async getInventory() {
            return await this.fetchFromS3(S3_PATHS.inventory);
        }

        async saveInventory(inventory) {
            return await this.saveToS3(S3_PATHS.inventory, inventory);
        }

        async uploadInventoryImage(file, itemId) {
            const timestamp = Date.now();
            const ext = file.name.split('.').pop();
            const path = `${S3_PATHS.inventoryImages}${itemId}_${timestamp}.${ext}`;
            return await this.uploadFile(file, path);
        }

        async getQuotes() {
            return await this.fetchFromS3(S3_PATHS.quotes);
        }

        async saveQuotes(quotes) {
            return await this.saveToS3(S3_PATHS.quotes, quotes);
        }

        async getStats() {
            return await this.fetchFromS3(S3_PATHS.stats);
        }

        async saveStats(stats) {
            return await this.saveToS3(S3_PATHS.stats, stats);
        }
    }

    // Initialize and expose globally
    window.S3Service = new S3Service();
    window.S3_PATHS = S3_PATHS;
    window.S3_CONFIG = S3_CONFIG;

})();
