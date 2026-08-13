"use client";

interface JobDescriptionCardProps {
  jobDescription: string;
}

export function JobDescriptionCard({
  jobDescription,
}: JobDescriptionCardProps) {
  return (
    <section className="job-description-card surface">
      <h2>Job Description</h2>
      <div>
        <p className="whitespace-pre-wrap">
          {jobDescription}
        </p>
      </div>
    </section>
  );
}
