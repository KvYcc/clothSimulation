"use client";
import React from "react";
import dynamic from 'next/dynamic';

const SetUp = dynamic(() => import('./SetUp'), { ssr: false });



const Page = () => {
  return (
    <div className="relative h-screen w-full">
      <SetUp />
      {/* <SetUp2 /> */}

    </div>
  );
};

export default Page;
