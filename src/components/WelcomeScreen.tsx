import React from "react";
import SignIn from "./SignIn";

const WelcomeScreen: React.FC = () => (
  <div className="welcome-screen p-8 max-w-2xl mx-auto">
    <h1 className="text-4xl font-bold mb-4 text-sky-800">Welcome to SkyNotes</h1>
    <p className="mb-4 text-sky-700">
      SkyNotes is a simple note-taking app that allows you to organize your thoughts, ideas, and tasks in the cloud.
    </p>
    <div className="mb-4">
      <img
        src="/public/app.png"
        alt="App structure diagram"
        className="rounded-lg shadow-md"
      />
    </div>
    <h2 className="text-2xl font-semibold mb-2 text-sky-700">Features:</h2>
    <ul className="list-disc list-inside mb-4 text-sky-600">
      <li>Create and organize notes in folders</li>
      <li>Default folders: Ideas, Tasks, Journal</li>
      <li>Customizable folder descriptions</li>
      <li>Private notes by default, with option to make public</li>
      <li>View public notes from other users</li>
      <li>Cloud synchronization across devices</li>
    </ul>
    <SignIn />
  </div>
);

export default WelcomeScreen;