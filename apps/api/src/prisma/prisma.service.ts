// src/prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { Pool }from 'pg';

@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
      constructor() {
            // TEMPORARY DIAGNOSTIC
            const connectionString = process.env.DATABASE_URL;

            if (!connectionString) {
            throw new Error('DATABASE_URL is not loaded.');
            }

            const dbUrl = new URL(connectionString);
            const port = Number(dbUrl.port);

            if (!dbUrl.port || !Number.isInteger(port) || port <= 0) {
                throw new Error('Invalid or missing PostgreSQL port in DATABASE_URL.');
            }

            console.log('Database connection properties:', {
                host: dbUrl.hostname,
                port,
                database: dbUrl.pathname,
                usernamePresent: Boolean(dbUrl.username),
                passwordPresent: Boolean(dbUrl.password),
            });
            const pool = new Pool({
                connectionString,
                max: 1,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
            })
            const adapter = new PrismaPg(pool);

            super({ adapter });
        }

        async onModuleInit() {
            await this.$connect();
        }

        async onModuleDestroy() {
            await this.$disconnect();
        }
  }
