"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export default function Home() {
  const [activeMainTab, setActiveMainTab] = useState("trending")
  const [activeSubTab, setActiveSubTab] = useState("rising")

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8 text-center">Loop Pulse</h1>
        
        <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full max-w-4xl mx-auto">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="food">Food</TabsTrigger>
            <TabsTrigger value="transit">Transit</TabsTrigger>
          </TabsList>

          <TabsContent value="trending" className="mt-6">
            <div className="bg-white dark:bg-black rounded-lg border p-6">
              <h2 className="text-2xl font-semibold mb-4">Trending</h2>
              
              <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
                <TabsList variant="line" className="w-full">
                  <TabsTrigger value="rising">Rising</TabsTrigger>
                  <TabsTrigger value="discover">Discover</TabsTrigger>
                </TabsList>

                <TabsContent value="rising" className="mt-4">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Rising Content</h3>
                    <p className="text-muted-foreground">
                      Discover what's rising in Chicago's culture scene right now.
                    </p>
                    <div className="grid gap-4">
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium">Local Art Exhibits</h4>
                        <p className="text-sm text-muted-foreground">Explore current gallery shows</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium">Music Venues</h4>
                        <p className="text-sm text-muted-foreground">Popular spots for live performances</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="discover" className="mt-4">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Discover New</h3>
                    <p className="text-muted-foreground">
                      Find hidden gems and off-the-beaten-path cultural experiences.
                    </p>
                    <div className="grid gap-4">
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium">Underground Theaters</h4>
                        <p className="text-sm text-muted-foreground">Intimate performance spaces</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium">Street Art Tours</h4>
                        <p className="text-sm text-muted-foreground">Murals and public installations</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>

          <TabsContent value="events" className="mt-6">
            <div className="bg-white dark:bg-black rounded-lg border p-6">
              <h2 className="text-2xl font-semibold mb-4">Events</h2>
              <p className="text-muted-foreground">Upcoming events in Chicago</p>
            </div>
          </TabsContent>

          <TabsContent value="food" className="mt-6">
            <div className="bg-white dark:bg-black rounded-lg border p-6">
              <h2 className="text-2xl font-semibold mb-4">Food</h2>
              <p className="text-muted-foreground">Chicago's food scene</p>
            </div>
          </TabsContent>

          <TabsContent value="transit" className="mt-6">
            <div className="bg-white dark:bg-black rounded-lg border p-6">
              <h2 className="text-2xl font-semibold mb-4">Transit</h2>
              <p className="text-muted-foreground">CTA and transit information</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
