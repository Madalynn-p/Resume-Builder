// This is the backend of the resume Builder 
// Imports start here

import { GoogleGenAI } from "@google/genai"
import 'dotenv/config';                                      
import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';


// App setups 


const app  = express();
const PORT = 8000;


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.use(cors());           
app.use(express.json());   
app.use(express.static(__dirname));


app.get('/', (req, res) => {
    res.redirect('/resume');
});

app.get('/resume', (req, res) => {
    // Send the single-page application HTML file
    res.sendFile(path.join(__dirname, 'index.html'));
});

  
// Data base starts/initalizes 
// SQLite database stored locally
// db.serialize() ensures the CREATE TABLE statements run in order


const db = new sqlite3.Database('./resume_data.db', (err) => {
    if (err) console.error('DB open error:', err.message);
    else     console.log('SQLite database connected.');
});

db.serialize(() => {
    // profile table – single row (id is always 1, enforced by CHECK)
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

    // jobs table – multiple entries; start/end year stored as text for flexibility so you can put the word present
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

    // education table 
    db.run(`
        CREATE TABLE IF NOT EXISTS education (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            school      TEXT,
            degree_type TEXT,
            field       TEXT,
            year        TEXT
        )
    `);

    // relevant table – projects, internships, classes, volunteer work, etc.
    db.run(`
        CREATE TABLE IF NOT EXISTS relevant (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            type  TEXT,
            title TEXT,
            desc  TEXT
        )
    `);

    // extras –  skills and certifications (id always 1) same as the other ids fields 
    db.run(`
        CREATE TABLE IF NOT EXISTS extras (
            id     INTEGER PRIMARY KEY CHECK (id = 1),
            skills TEXT,
            certs  TEXT
        )
    `);
});


// AI api route/POST /api/ai-generate
// This part was added by codex since the orginal one I had was broken but it works like the storybook one works 

// Same model you used 
const model = "gemini-3-flash-preview";

app.post('/api/ai-generate', async (req, res) => {
    // Get the generation type, resume context, and Gemini API key from the request body
    // type tells the server what to generate, such as "skills" or "achievements"
    // context is the text the user already entere
    // apiKey is the user's Gemini API key
    const { type, context, apiKey } = req.body;
    // If no API key was sent, stop the request and return an error
    if (!apiKey) {
        return res.status(400).json({ error: 'Missing Gemini API key' })
    }
    // If the user did not provide any context, stop the request and return an error
    // trim() removes empty spaces, so text like "   " counts as empty
    if (!context || !context.trim()) {
        return res.status(400).json({ error: 'Missing context for AI generation' });
    }

    try {
         // Create a Gemini AI client using the API key from the user
        const genAI = new GoogleGenAI({ apiKey });
        // This variable will hold the prompt that gets sent to Gemini
        let prompt = '';
        // If the frontend asks for skill suggestions, build a skills prompt
        if (type === 'skills') {
            prompt = `
You are helping improve a resume skills section.

The user already listed these skills:
${context}

Suggest exactly 2 additional relevant resume skills that fit with the existing skills.
Do not repeat skills already listed.
Return only the 2 skills as a comma-separated list.
No explanation.
`
// The promot for the achivements works the same as the skills 
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
`
       // If type is not "skills" or "achievements", return an error
        } else {
            return res.status(400).json({ error: 'Invalid AI generation type' });
        }
        // Send the prompt to Gemini and wait for the AI response
        const objResponse = await genAI.models.generateContent({
            model,
            contents: prompt,
        });
        // Send the AI suggestion back to the frontend as JSON
        // trim() removes extra spaces or blank lines from the AI response
        res.json({ suggestion: objResponse.text.trim() });

    } catch (error) {
        // If anything goes wrong, log the error in the server console
        console.error('AI generation error:', error);
        //Send a 500 error response back to the frontend
        res.status(500).json({ error: 'Error generating AI suggestion: ' + error.message });
    }
});




// Profile 
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


// Jobs 


// Add a new job entry 
app.post('/api/jobs', (req, res) => {
    const { company, role, start_year, end_year, details } = req.body;
    db.run( `INSERT INTO jobs (company, role, start_year, end_year, details) VALUES (?, ?, ?, ?, ?)`,[company, role, start_year, end_year, details],
         function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

// Retrieve all saved jobs (newest last, insertion order) 
app.get('/api/jobs', (req, res) => {
    db.all(`SELECT * FROM jobs`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

//Delete a specific job by its database ID 
app.delete('/api/jobs/:id', (req, res) => {
    db.run(`DELETE FROM jobs WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});

// Relevent experince/ project and such done  (projects, internships, etc.)


// Add a new relevant experience entry 
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

// Retrieve all relevant experience entries 
app.get('/api/relevant', (req, res) => {
    db.all(`SELECT * FROM relevant`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Delete a specific relevant experience entry by ID 
app.delete('/api/relevant/:id', (req, res) => {
    db.run(`DELETE FROM relevant WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});


// Education 


// Add a new education entry 
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

//Retrieve all saved education entries 
app.get('/api/education', (req, res) => {
    db.all(`SELECT * FROM education`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});


  //Delete a specific education entry by ID.
 
app.delete('/api/education/:id', (req, res) => {
    db.run(`DELETE FROM education WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: "ok" });
    });
});


// This is the extra stuff such as skills & certifications that you can add to your resume 


// Save or replace the single extras record 
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


// Start the server
app.listen(PORT, () => {
    console.log(` Resume.Pro running at http://localhost:${PORT}/resume`);
})
