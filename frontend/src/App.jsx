import { useState } from 'react';
import { FiUpload, FiFileText, FiSearch, FiList } from 'react-icons/fi'; // Importing icons
import './App.css';

function App() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [extractedResumeSkills, setExtractedResumeSkills] = useState([]);
  const [extractedJobSkills, setExtractedJobSkills] = useState([]);
  const [matchScore, setMatchScore] = useState(0);

  const handleFileChange = (event) => {
    setResumeFile(event.target.files[0]);
  };

  const handleJobDescriptionChange = (event) => {
    setJobDescription(event.target.value);
  };

  const handleMatchSkills = async () => {
    if (!resumeFile || !jobDescription) {
      alert('Please upload a resume and paste a job description.');
      return;
    }

    const formData = new FormData();
    formData.append('resume', resumeFile);
    formData.append('job_description', jobDescription);

    try {
      const response = await fetch('/match', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setExtractedResumeSkills(data.extracted_resume_skills || []);
        setExtractedJobSkills(data.extracted_job_skills || []);
        setMatchScore(data.match_score || 0);
      } else {
        alert('Error processing request.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred while connecting to the server.');
    }
  };

  return (
    <div className="container">
        <h1>SkillMatch App</h1>
        <div className="input-section">
            <div className="input-group">
                <h2><FiUpload /> Upload Resume (PDF)</h2>
                <input type="file" id="resumeUpload" accept=".pdf" onChange={handleFileChange} />
            </div>
            <div className="input-group">
                <h2><FiFileText /> Job Description</h2>
                <textarea id="jobDescription" placeholder="Paste job description here..." value={jobDescription} onChange={handleJobDescriptionChange}></textarea>
            </div>
        </div>
        <button onClick={handleMatchSkills}><FiSearch /> Extract Skills</button>
        {matchScore > 0 && (
            <div className="match-score-section">
                <h2>Match Score: {matchScore}%</h2>
            </div>
        )}
        <div className="results-section">
            <div className="results-group">
                <h3><FiList /> Skills from Resume:</h3>
                <ul id="resumeSkillsList">
                    {extractedResumeSkills.length > 0 ? (
                        extractedResumeSkills.map((skill, index) => <li key={index}>{skill}</li>)
                    ) : (
                        <li>No skills extracted from resume.</li>
                    )}
                </ul>
            </div>
            <div className="results-group">
                <h3><FiList /> Skills from Job Description:</h3>
                <ul id="jobSkillsList">
                    {extractedJobSkills.length > 0 ? (
                        extractedJobSkills.map((skill, index) => <li key={index}>{skill}</li>)
                    ) : (
                        <li>No skills extracted from job description.</li>
                    )}
                </ul>
            </div>
        </div>
    </div>
  );
}

export default App;
