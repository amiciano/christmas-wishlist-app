import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const members = sqliteTable('members', { id: text('id').primaryKey(), username: text('username').notNull().unique(), name: text('name').notNull(), password: text('password').notNull(), admin: integer('admin').notNull().default(0), mustChange: integer('must_change').notNull().default(1) });
export const sessions = sqliteTable('sessions', { token: text('token').primaryKey(), memberId: text('member_id').notNull().references(()=>members.id,{onDelete:'cascade'}), expires: integer('expires').notNull() });
export const wishes = sqliteTable('wishes', { id:text('id').primaryKey(), memberId:text('member_id').notNull().references(()=>members.id), title:text('title').notNull(), url:text('url').notNull().default(''), notes:text('notes').notNull().default(''), photo:text('photo').notNull().default(''), price:text('price').notNull().default(''), created:integer('created').notNull(), sortOrder:integer('sort_order').notNull().default(0) });
export const purchases = sqliteTable('purchases', { wishId:text('wish_id').primaryKey().references(()=>wishes.id,{onDelete:'cascade'}), buyerId:text('buyer_id').notNull().references(()=>members.id) });
export const attempts = sqliteTable('attempts', { key:text('key').primaryKey(), count:integer('count').notNull(), expires:integer('expires').notNull() });

