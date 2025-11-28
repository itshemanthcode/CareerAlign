from flask import Flask, request, jsonify, send_from_directory
from pdfminer.high_level import extract_text
import io
import spacy
from spacy.matcher import PhraseMatcher
from skills_data import SKILLS_LIST
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import nltk
from nltk.corpus import stopwords


try:
    nltk.data.find('corpora/stopwords')
except nltk.downloader.DownloadError:
    nltk.download('stopwords')

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='/')

# Load the SpaCy English model
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("Downloading SpaCy model 'en_core_web_sm'...")
    spacy.cli.download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

# Initialize PhraseMatcher with skills list
matcher = PhraseMatcher(nlp.vocab)
patterns = [nlp.make_doc(skill) for skill in SKILLS_LIST]
matcher.add("SkillPattern", patterns)

def extract_text_from_pdf(pdf_file):
    return extract_text(io.BytesIO(pdf_file.read()))

def extract_skills(text):
    doc = nlp(text)
    found_skills = set()
    
    # Use PhraseMatcher to find skills
    matches = matcher(doc)
    for match_id, start, end in matches:
        found_skills.add(doc[start:end].text)
    
    return list(found_skills)

def calculate_tfidf_cosine_similarity(resume_skills, job_skills):
    if not resume_skills or not job_skills:
        return 0.0
    
    all_skills = list(set(resume_skills + job_skills))
    if not all_skills:
        return 0.0

    vectorizer = TfidfVectorizer(stop_words=stopwords.words('english'))
    
    # Fit and transform the skills
    corpus = [" ".join(resume_skills), " ".join(job_skills)]
    tfidf_matrix = vectorizer.fit_transform(corpus)

    # Calculate cosine similarity
    if tfidf_matrix.shape[0] < 2:
        return 0.0
    
    similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
    return float(similarity)

def extract_education(text):
    education = []
    if "University of" in text or "College of" in text or "Bachelor" in text or "Master" in text or "Ph.D." in text:
        education.append("Relevant Education Found")
    return education

def extract_experience(text):
    experience = []
    if "Experience" in text or "Worked at" in text or "Software Engineer" in text or "Developer" in text or "Manager" in text:
        experience.append("Relevant Experience Found")
    return experience

def calculate_education_score(resume_education, job_description_text):
    score = 0
    if "Relevant Education Found" in resume_education and ("degree" in job_description_text.lower() or "education" in job_description_text.lower()):
        score = 0.5
    return score

def calculate_experience_score(resume_experience, job_description_text):
    score = 0
    if "Relevant Experience Found" in resume_experience and ("experience" in job_description_text.lower() or "years" in job_description_text.lower()):
        score = 0.5
    return score

@app.route('/match', methods=['POST'])
def match_skills():
    if 'resume' not in request.files:
        return jsonify({'error': 'No resume file provided'}), 400
    if 'job_description' not in request.form:
        return jsonify({'error': 'No job description provided'}), 400

    resume_file = request.files['resume']
    job_description_text = request.form['job_description']

    resume_text = extract_text_from_pdf(resume_file)

    extracted_resume_skills = extract_skills(resume_text)
    extracted_job_skills = extract_skills(job_description_text)

    print('Resume Skills: ', extracted_resume_skills)
    print("Job Skills: ", extracted_job_skills)

    resume_education = extract_education(resume_text)
    resume_experience = extract_experience(resume_text)

    tfidf_score = calculate_tfidf_cosine_similarity(extracted_resume_skills, extracted_job_skills)
    education_score = calculate_education_score(resume_education, job_description_text)
    experience_score = calculate_experience_score(resume_experience, job_description_text)

    total_score = (tfidf_score * 0.6) + (education_score * 0.2) + (experience_score * 0.2)
    match_score = round(total_score * 100)

    return jsonify({
        'resume_text': resume_text,
        'job_description_text': job_description_text,
        'extracted_resume_skills': extracted_resume_skills,
        'extracted_job_skills': extracted_job_skills,
        'match_score': match_score
    })

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(debug=True)
