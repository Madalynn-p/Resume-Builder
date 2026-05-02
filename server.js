/**
 * server.js – Resume.Pro Backend
 */

// ─────────────────────────────────────────────────────────────
// IMPORTS


import { GoogleGenAI } from "@google/genai"
import 'dotenv/config';                                      
import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// ─────────────────────────────────────────────────────────────
// APP SETUP


const app  = express();
const PORT = 8000;

// __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.use(cors());           
app.use(express.json());   



// ─────────────────────────────────────────────────────────────
// STATIC FILES
// Serve the entire project folder as static assets so Bootstrap,
// CSS, and JS files referenced from index.html are accessible.
// ─────────────────────────────────────────────────────────────
app.use(express.static(__dirname));

// ─────────────────────────────────────────────────────────────
// /resume ROUTE  ← serves the SPA
//
// Per the assignment requirement: the full application should be
// accessible at /resume.  We serve index.html for both the root
// path and /resume so either URL works.
// ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.redirect('/resume');
});

app.get('/resume', (req, res) => {
    // Send the single-page application HTML file
    res.sendFile(path.join(__dirname, 'index.html'));
});

  
// ─────────────────────────────────────────────────────────────
// DATABASE SETUP
// SQLite database stored locally – no server required.
// db.serialize() ensures the CREATE TABLE statements run in order
// before any other queries are executed.
// ─────────────────────────────────────────────────────────────
const db = new sqlite3.Database('./resume_data.db', (err) => {
    if (err) console.error('DB open error:', err.message);
    else     console.log('SQLite database connected.');
});

db.serialize(() => {
    // profile – single row (id is always 1, enforced by CHECK)
    db.run(`
        CREATE TABLE IF NOT EXISTS profile (
            id      INTEGER PRIMARY KEY CHECK (id = 1),
            name    TEXT,
            address TEXT,
            email   TEXT,
            phone   TEXT,
            city    TEXT,
            state   TEXT
        )
    `);

    // jobs – multiple entries; start/end year stored as text for flexibility
    db.run(`
        CREATE TABLE IF NOT EXISTS jobs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            company    TEXT,
            role       TEXT,
            start_year TEXT,
            end_year   TEXT,
            details    TEXT
        )
    `);

    // education – multiple entries; field and year are optional
    db.run(`
        CREATE TABLE IF NOT EXISTS education (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            school      TEXT,
            degree_type TEXT,
            field       TEXT,
            year        TEXT
        )
    `);

    // relevant – projects, internships, classes, volunteer work, etc.
    db.run(`
        CREATE TABLE IF NOT EXISTS relevant (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            type  TEXT,
            title TEXT,
            desc  TEXT
        )
    `);

    // extras – single row for skills and certifications (id always 1)
    db.run(`
        CREATE TABLE IF NOT EXISTS extras (
            id     INTEGER PRIMARY KEY CHECK (id = 1),
            skills TEXT,
            certs  TEXT
        )
    `);
});

// ─────────────────────────────────────────────────────────────
// AI ROUTE  POST /api/ai-generate
// Move genAI inside the route so it uses the per-request key
// Change this at the top of your file


// ... inside the app.post('/api/ai-generate' ...
const model = "gemini-3-flash-preview";

app.post('/api/ai-generate', async (req, res) => {
    const { type, context, apiKey } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'Missing Gemini API key' });
    }

    if (!context || !context.trim()) {
        return res.status(400).json({ error: 'Missing context for AI generation' });
    }

    try {
        const genAI = new GoogleGenAI({ apiKey });

        let prompt = '';

        if (type === 'skills') {
            prompt = `
You are helping improve a resume skills section.

The user already listed these skills:
${context}

Suggest exactly 2 additional relevant resume skills that fit with the existing skills.
Do not repeat skills already listed.
Return only the 2 skills as a comma-separated list.
No explanation.
`;
} else if (type === 'achievements') {
    prompt = `
You are helping improve a resume work experience section.

The user already wrote these responsibilities or achievements:
${context}

Suggest exactly 2 additional responsibilities or achievements that fit with what the user already wrote.
Make them professional, resume-ready, and action-oriented.
Do not repeat anything already listed.
Do not invent specific numbers, percentages, company names, or tools unless they were already provided.
Return only the 2 suggestions, each on its own line.
No explanation.
`;
       
        } else {
            return res.status(400).json({ error: 'Invalid AI generation type' });
        }

        const objResponse = await genAI.models.generateContent({
            model,
            contents: prompt,
        });

        res.json({ suggestion: objResponse.text.trim() });

    } catch (error) {
        console.error('AI generation error:', error);
        res.status(500).json({ error: 'Error generating AI suggestion: ' + error.message });
    }
});




// PROFILE ROUTES
app.post('/api/profile', (req, res) => {
    const { name, email, phone, address, city, state } = req.body;
    db.run(
        `INSERT OR REPLACE INTO profile (id, name, email, phone, address, city, state) VALUES (1, ?, ?, ?, ?, ?, ?)`,
        [name, email, phone, address, city, state],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ status: "ok" });
        }
    );
});

app.get('/api/profile', (req, res) => {
    db.get(`SELECT * FROM profile WHERE id = 1`, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

// ─────────────────────────────────────────────────────────────
// JOBS ROUTES
// ─────────────────────────────────────────────────────────────

/** Add a new job entry */
app.post('/api/jobs', (req, res) => {
    const { company, role, start_year, end_year, details } = req.body;
    db.run( `INSERT INTO jobs (company, role, start_year, end_year, details) VALUES (?, ?, ?, ?, ?)`,[company, role, start_year, end_year, details],
         function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

/** Retrieve all saved jobs (newest last, insertion order) */
app.get('/api/jobs', (req, res) => {
    db.all(`SELECT * FROM jobs`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

/** Delete a specific job by its database ID */
app.delete('/api/jobs/:id', (req, res) => {
    db.run(`DELETE FROM jobs WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});

// ─────────────────────────────────────────────────────────────
// RELEVANT EXPERIENCE ROUTES  (projects, internships, etc.)
// ─────────────────────────────────────────────────────────────

/** Add a new relevant experience entry */
app.post('/api/relevant', (req, res) => {
    const { type, title, desc } = req.body;
    db.run(
        `INSERT INTO relevant (type, title, desc) VALUES (?, ?, ?)`,
        [type, title, desc],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

/** Retrieve all relevant experience entries */
app.get('/api/relevant', (req, res) => {
    db.all(`SELECT * FROM relevant`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

/** Delete a specific relevant experience entry by ID */
app.delete('/api/relevant/:id', (req, res) => {
    db.run(`DELETE FROM relevant WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});

// ─────────────────────────────────────────────────────────────
// EDUCATION ROUTES
// ─────────────────────────────────────────────────────────────

/** Add a new education entry */
app.post('/api/education', (req, res) => {
    const { school, degree_type, field, year } = req.body;
    db.run(
        `INSERT INTO education (school, degree_type, field, year) VALUES (?, ?, ?, ?)`,
        [school, degree_type, field, year],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

/** Retrieve all saved education entries */
app.get('/api/education', (req, res) => {
    db.all(`SELECT * FROM education`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

/**
 * Delete a specific education entry by ID.
 * (This route was missing from the original server.js – added here.)
 */
app.delete('/api/education/:id', (req, res) => {
    db.run(`DELETE FROM education WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});

// ─────────────────────────────────────────────────────────────
// EXTRAS ROUTES  (skills & certifications)
// ─────────────────────────────────────────────────────────────

/** Save or replace the single extras record */
app.post('/api/extras', (req, res) => {
    const { skills, certs } = req.body;
    db.run(
        `INSERT OR REPLACE INTO extras (id, skills, certs) VALUES (1, ?, ?)`,
        [skills, certs],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ status: "ok" });
        }
    );
});

/** Retrieve saved skills and certifications (returns {} if none saved) */
app.get('/api/extras', (req, res) => {
    db.get(`SELECT * FROM extras WHERE id = 1`, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(` Resume.Pro running at http://localhost:${PORT}/resume`);
})